package com.penta2himajin.omochat.companion

import android.app.Application
import java.io.File

class OmoservApp : Application() {
    lateinit var tokenStore: TokenStore
        private set
    lateinit var modelStore: ModelStore
        private set
    lateinit var llm: LiteRtLmEngine
        private set
    val scheduler = InferenceScheduler()

    override fun onCreate() {
        super.onCreate()
        instance = this
        tokenStore = TokenStore(this)
        tokenStore.getOrCreate()
        modelStore = ModelStore(this)
        llm = LiteRtLmEngine(
            modelStore,
            cacheDir = File(cacheDir, "litertlm"),
            toolProviders = DeviceToolSets.providers(this),
        )
    }

    companion object {
        @Volatile
        lateinit var instance: OmoservApp
            private set
    }
}
