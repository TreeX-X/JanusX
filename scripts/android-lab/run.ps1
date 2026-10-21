param(
    [ValidateSet('Prepare','Build','Emulator','Install','Smoke')][string]$Action = 'Build',
    [string]$ToolsRoot = 'D:\JanusX-Android',
    [string]$Device = 'emulator-5554',
    [ValidateSet('lan','develop')][string]$RemoteScope = 'lan'
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$jdk = Get-ChildItem -LiteralPath $ToolsRoot -Directory | Where-Object Name -Like 'jdk-17*' | Select-Object -First 1
if (!$jdk) { throw "JDK 17 missing under $ToolsRoot. See README.md." }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = Join-Path $ToolsRoot 'sdk'
$env:ANDROID_USER_HOME = Join-Path $ToolsRoot 'android-user'
$env:ANDROID_AVD_HOME = Join-Path $ToolsRoot 'avd'
$env:GRADLE_USER_HOME = Join-Path $ToolsRoot 'gradle-cache'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
switch ($Action) {
    'Prepare' {
        New-Item -ItemType Directory -Force $env:ANDROID_USER_HOME,$env:ANDROID_AVD_HOME | Out-Null
        $sdkManager = Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin\sdkmanager.bat'
        1..20 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$env:ANDROID_HOME" --licenses
        Check-Exit
        if (!(Test-Path (Join-Path $env:ANDROID_AVD_HOME 'JanusX_API35.ini'))) {
            'no' | & (Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin\avdmanager.bat') create avd -n JanusX_API35 -k 'system-images;android-35;google_apis;x86_64' -d pixel_6
            Check-Exit
        }
    }
    'Build' {
        $sdkPath = $env:ANDROID_HOME.Replace('\','/')
        [IO.File]::WriteAllText((Join-Path $repoRoot 'apps\android-lab\local.properties'), "sdk.dir=$sdkPath`n")
        $gradleArgs = @('-p', (Join-Path $repoRoot 'apps\android-lab'), "-PremoteScope=$RemoteScope", '--console=plain', '--no-daemon', '--info', '-Dorg.gradle.internal.http.connectionTimeout=30000', '-Dorg.gradle.internal.http.socketTimeout=30000')
        $proxyValue = if ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } else { $env:HTTP_PROXY }
        if ($proxyValue) {
            $proxyUri = [Uri]$proxyValue
            if ($proxyUri.UserInfo) { throw 'Authenticated proxy requires explicit Gradle credential configuration.' }
            $gradleArgs += @("-Dhttps.proxyHost=$($proxyUri.Host)", "-Dhttps.proxyPort=$($proxyUri.Port)", "-Dhttp.proxyHost=$($proxyUri.Host)", "-Dhttp.proxyPort=$($proxyUri.Port)", '-Dhttp.nonProxyHosts=localhost|127.*|repo.maven.apache.org')
        }
        # Invoke Java directly so proxy bypass patterns containing | never pass through cmd.exe.
        # Windows PowerShell treats redirected javac warnings as errors; use the native exit code.
        $previousErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & (Join-Path $env:JAVA_HOME 'bin\java.exe') '-classpath' (Join-Path $ToolsRoot 'gradle-8.9\lib\gradle-launcher-8.9.jar') 'org.gradle.launcher.GradleMain' @gradleArgs ':app:assembleDebug' ':app:lintDebug' ':app:testDebugUnitTest'
            $gradleExitCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousErrorPreference }
        if ($gradleExitCode -ne 0) { throw "Gradle failed with exit code $gradleExitCode" }
    }
    'Emulator' {
        $emulator = Join-Path $env:ANDROID_HOME 'emulator\emulator.exe'
        & $emulator -accel-check
        Check-Exit
        # Visible Android device window; the helper's console remains hidden.
        Start-Process -FilePath $emulator -ArgumentList @('-avd','JanusX_API35','-memory','2048','-cores','2','-gpu','swiftshader','-no-snapshot','-no-boot-anim') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ToolsRoot 'emulator.stdout.log') -RedirectStandardError (Join-Path $ToolsRoot 'emulator.stderr.log')
    }
    'Install' {
        $metadata = Get-Content -LiteralPath (Join-Path $repoRoot 'apps\android-lab\app\build\outputs\apk\debug\output-metadata.json') -Raw | ConvertFrom-Json
        $packageId = if ($RemoteScope -eq 'lan') { 'com.janusx.p2plab.lan' } else { 'com.janusx.p2plab' }
        if ($metadata.applicationId -ne $packageId) { throw "APK scope mismatch. Run Build -RemoteScope $RemoteScope first." }
        & $adb -s $Device install -r (Join-Path $repoRoot 'apps\android-lab\app\build\outputs\apk\debug\app-debug.apk')
        Check-Exit
        & $adb -s $Device shell am start -n "$packageId/com.janusx.p2plab.MainActivity"
        Check-Exit
    }
    'Smoke' {
        $env:JANUSX_ANDROID_TOOLS = $ToolsRoot
        $env:ANDROID_SERIAL = $Device
        $env:JANUSX_SMOKE_SCOPE = $RemoteScope
        & node (Join-Path $PSScriptRoot 'desktop-smoke.mjs')
        Check-Exit
    }
}
