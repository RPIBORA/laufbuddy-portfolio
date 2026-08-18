package app.laufbuddy

import android.app.Activity
import android.app.Application
import android.content.res.Configuration
import android.os.Bundle

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
    this,
    object : DefaultReactNativeHost(this) {
      override fun getPackages(): List<ReactPackage> =
        PackageList(this).packages.apply {
          add(HeadphoneConnectionPackage())
          add(PhoneCallPackage())
          add(AudioFocusControlPackage())
          add(LaufBuddyHotwordControlPackage())
          add(CellularServiceStatePackage())
        }

      override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
    }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()

    appInstance = this
    // Force-stop is the sole Android state in which receivers and workers are
    // suppressed.  As soon as the user opens the app again, repair any durable
    // emergency request without starting microphone or hotword capture.
    NativeEmergencyCallStore.repairAndEnqueue(this)

    registerActivityLifecycleCallbacks(
      object : ActivityLifecycleCallbacks {
        override fun onActivityStarted(activity: Activity) {
          startedActivityCount += 1
        }

        override fun onActivityStopped(activity: Activity) {
          startedActivityCount = (startedActivityCount - 1).coerceAtLeast(0)
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
        override fun onActivityResumed(activity: Activity) = Unit
        override fun onActivityPaused(activity: Activity) = Unit
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
        override fun onActivityDestroyed(activity: Activity) = Unit
      }
    )

    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }

    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  companion object {
    @Volatile
    private var appInstance: MainApplication? = null

    @Volatile
    private var startedActivityCount: Int = 0

    fun isAppVisible(): Boolean {
      return startedActivityCount > 0
    }
  }
}
