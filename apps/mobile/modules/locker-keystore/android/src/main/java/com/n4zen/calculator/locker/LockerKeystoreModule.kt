package com.n4zen.calculator.locker

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class LockerKeystoreModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LockerKeystore"

  @ReactMethod
  fun isSupported(promise: Promise) {
    val authenticator = allowedAuthenticators()
    val manager = BiometricManager.from(reactContext)
    val status = manager.canAuthenticate(authenticator)
    promise.resolve(status == BiometricManager.BIOMETRIC_SUCCESS)
  }

  @ReactMethod
  fun ensureKey(alias: String, promise: Promise) {
    try {
      getOrCreateSecretKey(alias)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("KEY_ERROR", e)
    }
  }

  @ReactMethod
  fun wrapVmk(alias: String, vmkB64: String, promptTitle: String, promptSubtitle: String, promise: Promise) {
    val activity = getReactApplicationContext().getCurrentActivity() as? FragmentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Current activity is not available")
      return
    }

    try {
      val key = getOrCreateSecretKey(alias)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key)

      authenticate(activity, cipher, promptTitle, promptSubtitle, object : CryptoCallback {
        override fun onSuccess(cipher: Cipher) {
          try {
            val vmkBytes = Base64.decode(vmkB64, Base64.NO_WRAP)
            val ct = cipher.doFinal(vmkBytes)
            val nonce = cipher.iv
            val result = Arguments.createMap()
            result.putString("nonceB64", Base64.encodeToString(nonce, Base64.NO_WRAP))
            result.putString("ctB64", Base64.encodeToString(ct, Base64.NO_WRAP))
            promise.resolve(result)
          } catch (e: Exception) {
            promise.reject("ENCRYPT_ERROR", e)
          }
        }

        override fun onError(code: Int, message: String) {
          promise.reject(code.toString(), message)
        }
      })
    } catch (e: Exception) {
      promise.reject("CIPHER_ERROR", e)
    }
  }

  @ReactMethod
  fun unwrapVmk(alias: String, nonceB64: String, ctB64: String, promptTitle: String, promptSubtitle: String, promise: Promise) {
    val activity = getReactApplicationContext().getCurrentActivity()  as? FragmentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Current activity is not available")
      return
    }

    try {
      val key = getOrCreateSecretKey(alias)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      val nonce = Base64.decode(nonceB64, Base64.NO_WRAP)
      val spec = GCMParameterSpec(128, nonce)
      cipher.init(Cipher.DECRYPT_MODE, key, spec)

      authenticate(activity, cipher, promptTitle, promptSubtitle, object : CryptoCallback {
        override fun onSuccess(cipher: Cipher) {
          try {
            val ct = Base64.decode(ctB64, Base64.NO_WRAP)
            val vmkBytes = cipher.doFinal(ct)
            val vmkB64 = Base64.encodeToString(vmkBytes, Base64.NO_WRAP)
            promise.resolve(vmkB64)
          } catch (e: Exception) {
            promise.reject("DECRYPT_ERROR", e)
          }
        }

        override fun onError(code: Int, message: String) {
          promise.reject(code.toString(), message)
        }
      })
    } catch (e: Exception) {
      promise.reject("CIPHER_ERROR", e)
    }
  }

  @ReactMethod
  fun deleteKey(alias: String, promise: Promise) {
    try {
      val keyStore = KeyStore.getInstance("AndroidKeyStore")
      keyStore.load(null)
      if (keyStore.containsAlias(alias)) {
        keyStore.deleteEntry(alias)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("DELETE_ERROR", e)
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
              if (crypto != null) callback.onSuccess(crypto)
              else callback.onError(-1, "Cipher unavailable")
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
              callback.onError(errorCode, errString.toString())
            }

            override fun onAuthenticationFailed() {
              // optional: ignore; user can retry
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
    if (existing is SecretKey) return existing

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
