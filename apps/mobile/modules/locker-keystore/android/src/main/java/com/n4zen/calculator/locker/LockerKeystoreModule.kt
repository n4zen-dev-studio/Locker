package com.n4zen.calculator.locker

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class LockerKeystoreModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LockerKeystore")

    AsyncFunction("isSupported") {
      val manager = BiometricManager.from(appContext.reactContext ?: throw Exceptions.ReactContextLost())
      manager.canAuthenticate(allowedAuthenticators()) == BiometricManager.BIOMETRIC_SUCCESS
    }

    AsyncFunction("ensureKey") { alias: String, promise: Promise ->
      try {
        getOrCreateSecretKey(alias)
        promise.resolve()
      } catch (e: Exception) {
        promise.reject("KEY_ERROR", e.message, e)
      }
    }

    AsyncFunction("wrapVmk") { alias: String, vmkB64: String, promptTitle: String, promptSubtitle: String, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "Current activity is not available", null)
        return@AsyncFunction
      }

      try {
        val key = getOrCreateSecretKey(alias)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)

        authenticate(activity, cipher, promptTitle, promptSubtitle, object : CryptoCallback {
          override fun onSuccess(cipher: Cipher) {
            try {
              val vmkBytes = Base64.decode(vmkB64, Base64.NO_WRAP)
              val ciphertext = cipher.doFinal(vmkBytes)
              val result = mapOf(
                "nonceB64" to Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
                "ctB64" to Base64.encodeToString(ciphertext, Base64.NO_WRAP),
              )
              promise.resolve(result)
            } catch (e: Exception) {
              promise.reject("ENCRYPT_ERROR", e.message, e)
            }
          }

          override fun onError(code: Int, message: String) {
            promise.reject(code.toString(), message, null)
          }
        })
      } catch (e: Exception) {
        promise.reject("CIPHER_ERROR", e.message, e)
      }
    }

    AsyncFunction("unwrapVmk") { alias: String, nonceB64: String, ctB64: String, promptTitle: String, promptSubtitle: String, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "Current activity is not available", null)
        return@AsyncFunction
      }

      try {
        val key = getOrCreateSecretKey(alias)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val nonce = Base64.decode(nonceB64, Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, nonce))

        authenticate(activity, cipher, promptTitle, promptSubtitle, object : CryptoCallback {
          override fun onSuccess(cipher: Cipher) {
            try {
              val ciphertext = Base64.decode(ctB64, Base64.NO_WRAP)
              val vmkBytes = cipher.doFinal(ciphertext)
              promise.resolve(Base64.encodeToString(vmkBytes, Base64.NO_WRAP))
            } catch (e: Exception) {
              promise.reject("DECRYPT_ERROR", e.message, e)
            }
          }

          override fun onError(code: Int, message: String) {
            promise.reject(code.toString(), message, null)
          }
        })
      } catch (e: Exception) {
        promise.reject("CIPHER_ERROR", e.message, e)
      }
    }

    AsyncFunction("deleteKey") { alias: String, promise: Promise ->
      try {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)
        if (keyStore.containsAlias(alias)) {
          keyStore.deleteEntry(alias)
        }
        promise.resolve()
      } catch (e: Exception) {
        promise.reject("DELETE_ERROR", e.message, e)
      }
    }
  }

  private fun authenticate(
    activity: FragmentActivity,
    cipher: Cipher,
    promptTitle: String,
    promptSubtitle: String,
    callback: CryptoCallback,
  ) {
    activity.runOnUiThread {
      try {
        val executor = ContextCompat.getMainExecutor(activity)
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
          .setTitle(promptTitle)
          .setSubtitle(promptSubtitle)
          .setAllowedAuthenticators(allowedAuthenticators())
          .build()

        val prompt = BiometricPrompt(
          activity,
          executor,
          object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
              val crypto = result.cryptoObject?.cipher
              if (crypto != null) {
                callback.onSuccess(crypto)
              } else {
                callback.onError(-1, "Cipher unavailable")
              }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
              callback.onError(errorCode, errString.toString())
            }

            override fun onAuthenticationFailed() {
              // The prompt stays open and the user can retry.
            }
          },
        )

        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
      } catch (e: Exception) {
        callback.onError(-1, e.message ?: "Authentication error")
      }
    }
  }

  private fun allowedAuthenticators(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      BiometricManager.Authenticators.BIOMETRIC_STRONG or
        BiometricManager.Authenticators.DEVICE_CREDENTIAL
    } else {
      BiometricManager.Authenticators.BIOMETRIC_STRONG
    }
  }

  private fun getOrCreateSecretKey(alias: String): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore")
    keyStore.load(null)
    val existing = keyStore.getKey(alias, null)
    if (existing is SecretKey) {
      return existing
    }

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    val builder = KeyGenParameterSpec.Builder(
      alias,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
    )
      .setKeySize(256)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(false)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(
        0,
        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
      )
    } else {
      builder.setUserAuthenticationValidityDurationSeconds(-1)
    }

    keyGenerator.init(builder.build())
    return keyGenerator.generateKey()
  }

  private interface CryptoCallback {
    fun onSuccess(cipher: Cipher)
    fun onError(code: Int, message: String)
  }
}
