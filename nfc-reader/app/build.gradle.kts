plugins {
    id("com.android.application")
}

android {
    namespace = "com.doch1.nfcreader"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.doch1.nfcreader"
        minSdk = 23
        targetSdk = 36
        versionCode = 4
        versionName = "1.3"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
