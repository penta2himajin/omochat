package com.penta2himajin.omochat.companion

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

/**
 * Spike STT: feed glasses/client PCM into the platform SpeechRecognizer via
 * [RecognizerIntent.EXTRA_AUDIO_SOURCE] (pipe). Device support varies by OEM.
 */
class OsSpeechSttEngine(
    private val appContext: Context,
) : SttEngine {
    private val mainHandler = Handler(Looper.getMainLooper())

    override val isAvailable: Boolean
        get() = SpeechRecognizer.isRecognitionAvailable(appContext)

    override val backendLabel: String
        get() = if (isAvailable) "os-speech" else "unavailable"

    override fun transcribePcm16leMono16k(pcm: ByteArray, languageTag: String?): String {
        if (!isAvailable) {
            throw SttException("Speech recognition unavailable on this device", "stt_unavailable")
        }
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            throw SttException(
                "RECORD_AUDIO not granted — open omoserv and allow microphone",
                "stt_permission",
            )
        }
        if (pcm.isEmpty()) {
            throw SttException("Empty audio", "invalid_request")
        }

        val textRef = AtomicReference<String?>(null)
        val errorRef = AtomicReference<String?>(null)
        val latch = CountDownLatch(1)

        mainHandler.post {
            var recognizer: SpeechRecognizer? = null
            var readPfd: ParcelFileDescriptor? = null
            var writePfd: ParcelFileDescriptor? = null
            var finished = false
            fun finishOnce() {
                if (finished) return
                finished = true
                try {
                    recognizer?.destroy()
                } catch (_: Throwable) {
                }
                try {
                    readPfd?.close()
                } catch (_: Throwable) {
                }
                latch.countDown()
            }

            try {
                val pipes = ParcelFileDescriptor.createPipe()
                readPfd = pipes[0]
                writePfd = pipes[1]

                val writeEnd = writePfd
                thread(name = "omoserv-stt-pcm", isDaemon = true) {
                    try {
                        FileOutputStream(writeEnd.fileDescriptor).use { out ->
                            writeRealtime(out, pcm)
                        }
                    } catch (_: Throwable) {
                        // Reader closed early is expected when recognition ends.
                    } finally {
                        try {
                            writeEnd.close()
                        } catch (_: Throwable) {
                        }
                    }
                }

                recognizer = createRecognizer()
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                    putExtra(
                        RecognizerIntent.EXTRA_LANGUAGE,
                        languageTag?.takeIf { it.isNotBlank() } ?: "ja-JP",
                    )
                    putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, readPfd)
                    putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                    putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                    putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, AudioPcm.SAMPLE_RATE)
                }

                recognizer.setRecognitionListener(
                    object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) {}
                        override fun onBeginningOfSpeech() {}
                        override fun onRmsChanged(rmsdB: Float) {}
                        override fun onBufferReceived(buffer: ByteArray?) {}
                        override fun onEvent(eventType: Int, params: Bundle?) {}
                        override fun onEndOfSpeech() {}

                        override fun onPartialResults(partialResults: Bundle?) {
                            bestText(partialResults)?.let { textRef.set(it) }
                        }

                        override fun onError(error: Int) {
                            // Keep any partial/final text we already captured.
                            if (textRef.get().isNullOrBlank()) {
                                errorRef.compareAndSet(
                                    null,
                                    "SpeechRecognizer error $error (${errorName(error)})",
                                )
                            }
                            finishOnce()
                        }

                        override fun onResults(results: Bundle?) {
                            Log.i(TAG, "onResults keys=${results?.keySet()} texts=${allTexts(results)}")
                            bestText(results)?.let { textRef.set(it) }
                            if (textRef.get().isNullOrBlank()) {
                                errorRef.compareAndSet(null, "Empty recognition result")
                            }
                            finishOnce()
                        }

                        override fun onSegmentResults(segmentResults: Bundle) {
                            bestText(segmentResults)?.let { textRef.set(it) }
                        }

                        override fun onEndOfSegmentedSession() {
                            if (textRef.get().isNullOrBlank()) {
                                errorRef.compareAndSet(null, "No speech recognized")
                            }
                            finishOnce()
                        }
                    },
                )

                recognizer.startListening(intent)
            } catch (e: Throwable) {
                errorRef.compareAndSet(null, e.message ?: "stt start failed")
                try {
                    recognizer?.destroy()
                } catch (_: Throwable) {
                }
                try {
                    readPfd?.close()
                } catch (_: Throwable) {
                }
                try {
                    writePfd?.close()
                } catch (_: Throwable) {
                }
                latch.countDown()
            }
        }

        val ok = latch.await(TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (!ok) {
            throw SttException("Speech recognition timed out", "stt_timeout")
        }
        textRef.get()?.takeIf { it.isNotBlank() }?.let { return it }
        throw SttException(errorRef.get() ?: "Speech recognition failed", "stt_error")
    }

    private fun createRecognizer(): SpeechRecognizer {
        // Default recognizer (OEM / Google). On-device-only constructor has been observed to
        // complete with empty client-side result bundles on some Samsung builds.
        return SpeechRecognizer.createSpeechRecognizer(appContext)
    }

    private fun writeRealtime(out: FileOutputStream, pcm: ByteArray) {
        var offset = 0
        val chunk = AudioPcm.BYTES_PER_SECOND / 10 // 100ms
        val startNs = System.nanoTime()
        while (offset < pcm.size) {
            val end = minOf(offset + chunk, pcm.size)
            out.write(pcm, offset, end - offset)
            out.flush()
            offset = end
            val elapsedMs = (System.nanoTime() - startNs) / 1_000_000L
            val targetMs = (offset.toLong() * 1000L) / AudioPcm.BYTES_PER_SECOND
            val sleep = targetMs - elapsedMs
            if (sleep > 0) Thread.sleep(sleep)
        }
    }

    private fun errorName(code: Int): String =
        when (code) {
            SpeechRecognizer.ERROR_AUDIO -> "ERROR_AUDIO"
            SpeechRecognizer.ERROR_CLIENT -> "ERROR_CLIENT"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "ERROR_INSUFFICIENT_PERMISSIONS"
            SpeechRecognizer.ERROR_NETWORK -> "ERROR_NETWORK"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "ERROR_NETWORK_TIMEOUT"
            SpeechRecognizer.ERROR_NO_MATCH -> "ERROR_NO_MATCH"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "ERROR_RECOGNIZER_BUSY"
            SpeechRecognizer.ERROR_SERVER -> "ERROR_SERVER"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "ERROR_SPEECH_TIMEOUT"
            else -> "UNKNOWN"
        }

    companion object {
        private const val TAG = "omoserv-stt"
        private const val TIMEOUT_MS = 60_000L

        private fun bestText(bundle: Bundle?): String? =
            allTexts(bundle).firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }

        private fun allTexts(bundle: Bundle?): List<String> {
            if (bundle == null) return emptyList()
            val out = ArrayList<String>()
            fun addAll(list: List<*>?) {
                if (list == null) return
                for (item in list) {
                    val s = item?.toString()?.trim().orEmpty()
                    if (s.isNotEmpty()) out.add(s)
                }
            }
            addAll(bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
            addAll(bundle.getCharSequenceArrayList(SpeechRecognizer.RESULTS_RECOGNITION))
            // Some OEM binders use alternate keys.
            for (key in bundle.keySet()) {
                addAll(bundle.getStringArrayList(key))
                @Suppress("DEPRECATION")
                addAll(bundle.getCharSequenceArrayList(key))
            }
            return out.distinct()
        }
    }
}
