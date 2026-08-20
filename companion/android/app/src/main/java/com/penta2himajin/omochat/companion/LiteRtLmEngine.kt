package com.penta2himajin.omochat.companion

import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.MessageCallback
import com.google.ai.edge.litertlm.SamplerConfig
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class LiteRtLmEngine(
    private val modelStore: ModelStore,
    private val cacheDir: File,
) : LlmEngine {
    private val engineRef = AtomicReference<Engine?>(null)
    @Volatile private var backendName: String = "none"

    override val modelId: String = CompanionConfig.MODEL_ID
    override val backendLabel: String get() = backendName
    override val isReady: Boolean get() = engineRef.get() != null

    override fun ensureReady() {
        if (engineRef.get() != null) return
        synchronized(this) {
            if (engineRef.get() != null) return
            if (!modelStore.isReady()) {
                throw IllegalStateException("model not downloaded; open omoserv and tap Download model")
            }
            val path = modelStore.modelPath()
            cacheDir.mkdirs()
            val engine = tryInit(path, preferGpu = true) ?: tryInit(path, preferGpu = false)
                ?: throw IllegalStateException("failed to initialize LiteRT-LM (GPU and CPU)")
            engineRef.set(engine)
        }
    }

    private fun tryInit(path: String, preferGpu: Boolean): Engine? {
        return try {
            val backend = if (preferGpu) Backend.GPU() else Backend.CPU()
            val config = EngineConfig(
                modelPath = path,
                backend = backend,
                cacheDir = cacheDir.absolutePath,
            )
            val engine = Engine(config)
            engine.initialize()
            backendName = if (preferGpu) "gpu" else "cpu"
            Log.i(TAG, "LiteRT-LM ready backend=$backendName path=$path")
            engine
        } catch (e: Exception) {
            Log.w(TAG, "LiteRT-LM init failed preferGpu=$preferGpu: ${e.message}", e)
            null
        }
    }

    override fun streamChat(request: ChatRequest, onDelta: (ChatDelta) -> Unit) {
        ensureReady()
        val engine = engineRef.get() ?: throw IllegalStateException("engine not ready")
        val system = ChatRequestParser.systemText(request.messages)
        val pair = ChatRequestParser.historyBeforeLastUser(request.messages)
            ?: throw IllegalArgumentException("messages must end with a user turn")
        val (prior, lastUser) = pair

        val initial = prior.map { msg ->
            when (msg.role) {
                "user" -> Message.user(msg.content)
                else -> Message.model(msg.content)
            }
        }

        val temperature = request.temperature ?: 0.7
        val sampler = SamplerConfig(
            topK = 40,
            topP = 0.95,
            temperature = temperature,
        )

        val conversationConfig = ConversationConfig(
            systemInstruction = Contents.of(system),
            initialMessages = initial,
            samplerConfig = sampler,
        )

        // Prefer MessageCallback over Flow sendMessageAsync: the Flow path calls
        // SendChannel.close$default which crashes (NoSuchMethodError) against
        // kotlinx-coroutines DefaultImpls ABI shipped in 1.8–1.10.
        engine.createConversation(conversationConfig).use { conversation ->
            val latch = CountDownLatch(1)
            val errorRef = AtomicReference<Throwable?>(null)
            var previous = ""

            conversation.sendMessageAsync(
                lastUser,
                object : MessageCallback {
                    override fun onMessage(message: Message) {
                        val full = messageText(message)
                        val step = StreamingText.step(previous, full)
                        previous = step.previous
                        if (step.delta.isNotEmpty()) {
                            emitDelta(onDelta, ChatDelta(step.delta))
                        }
                    }

                    override fun onDone() {
                        try {
                            emitDelta(onDelta, ChatDelta("", done = true))
                        } finally {
                            latch.countDown()
                        }
                    }

                    override fun onError(throwable: Throwable) {
                        errorRef.set(throwable)
                        latch.countDown()
                    }
                },
            )

            if (!latch.await(10, TimeUnit.MINUTES)) {
                throw IllegalStateException("LiteRT-LM generation timed out")
            }
            errorRef.get()?.let { throw it }
        }
    }

    override fun close() {
        synchronized(this) {
            engineRef.getAndSet(null)?.close()
            backendName = "none"
        }
    }

    private fun messageText(message: Message): String {
        val parts = ArrayList<String>()
        for (content in message.contents.contents) {
            if (content is Content.Text) {
                parts.add(content.text)
            }
        }
        if (parts.isNotEmpty()) return parts.joinToString("")
        // Fallback for unexpected payload shapes.
        return try {
            val m = message.javaClass.methods.firstOrNull { it.name == "getText" && it.parameterCount == 0 }
            val v = m?.invoke(message)
            if (v is String) v else ""
        } catch (_: Throwable) {
            ""
        }
    }

    /** Never let callback exceptions escape onto LiteRT-LM's JNI thread (process-killing). */
    private fun emitDelta(onDelta: (ChatDelta) -> Unit, delta: ChatDelta) {
        try {
            onDelta(delta)
        } catch (t: Throwable) {
            Log.w(TAG, "onDelta failed (client disconnected?): ${t.message}")
        }
    }

    companion object {
        private const val TAG = "omoserv-llm"
    }
}
