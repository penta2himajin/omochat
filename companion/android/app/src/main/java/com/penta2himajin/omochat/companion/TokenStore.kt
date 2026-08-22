package com.penta2himajin.omochat.companion

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.SecureRandom

class TokenStore(context: Context) : ApiTokenAuth {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun getOrCreate(): String {
        val existing = prefs.getString(KEY_TOKEN, null)
        if (!existing.isNullOrBlank()) return existing
        return regenerate()
    }

    fun current(): String = getOrCreate()

    fun regenerate(): String {
        val token = generateToken()
        prefs.edit().putString(KEY_TOKEN, token).apply()
        return token
    }

    override fun matches(candidate: String?): Boolean {
        if (candidate.isNullOrBlank()) return false
        return candidate == current()
    }

    companion object {
        private const val PREFS_NAME = "omoserv_secure"
        private const val KEY_TOKEN = "api_token"
        private const val TOKEN_PREFIX = "omoserv_"

        fun generateToken(): String {
            val bytes = ByteArray(24)
            SecureRandom().nextBytes(bytes)
            val encoded = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            return TOKEN_PREFIX + encoded
        }
    }
}
