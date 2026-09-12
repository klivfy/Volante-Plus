#!/usr/bin/env bash
#
# Empacota o export estático do Next.js (web/out) num APK WebView, sem Gradle.
#
# Existe porque o Gradle precisa baixar o Android Gradle Plugin de
# `dl.google.com`, bloqueado pelo proxy do ambiente de desenvolvimento. O
# caminho aqui usa só a toolchain local (aapt2 + d8/r8 + zipalign + apksigner),
# na ordem exigida pelo PackageManager:
#
#   aapt2 compile -> aapt2 link (-A assets) -> javac -> d8 -> zipalign -> apksigner
#
# Três armadilhas que já quebraram builds anteriores e que este script fecha:
#
#   1. Assets embarcados com `zip -r base.apk assets/`. O zip grava o caminho
#      relativo de onde foi chamado (ex.: `apk_simple/assets/www/...`), então o
#      AssetManager não acha nada e, pior, o APK final vira um zip comum sem
#      manifesto binário. Assets entram por `aapt2 link -A`, nunca por zip.
#   2. `package` do manifesto divergindo do pacote Java do MainActivity. O
#      manifesto declara a activity como `.MainActivity`, que resolve para
#      `<package>.MainActivity`; se o .java estiver noutro pacote, a classe não
#      é encontrada. Aqui os dois vêm da mesma variável (APP_PACKAGE).
#   3. Assinar antes de alinhar. `apksigner` preserva o alinhamento, mas o
#      inverso não vale: alinhar depois de assinar invalida a assinatura.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${APK_TOOLS_DIR:-/tmp/apk-tools}"

AAPT2="${AAPT2:-$TOOLS_DIR/d8-package/bin/x64/linux/aapt2}"
R8_JAR="${R8_JAR:-$TOOLS_DIR/r8/r8.jar}"
ANDROID_JAR="${ANDROID_JAR:-$TOOLS_DIR/sdk-stub/android-stub.jar}"

# `versionCode` precisa subir a cada APK entregue: se o aparelho já tem uma
# versão igual ou maior instalada, o PackageManager recusa com
# INSTALL_FAILED_VERSION_DOWNGRADE antes mesmo de olhar o conteúdo.
VERSION_CODE="${VERSION_CODE:-3}"
VERSION_NAME="${VERSION_NAME:-2.1.0}"
MIN_SDK="${MIN_SDK:-26}"
TARGET_SDK="${TARGET_SDK:-35}"

# Mesmo pacote do MainActivity.java (ver armadilha 2). Mantido em
# `com.volanteplus.webview` — distinto do app Gradle
# (`com.volanteplus.loterias`) para que os dois possam coexistir no aparelho.
APP_PACKAGE="${APP_PACKAGE:-com.volanteplus.webview}"
APP_LABEL="${APP_LABEL:-Volante+}"

KEYSTORE="${KEYSTORE:-$ROOT_DIR/volanteplus.keystore}"
KEY_ALIAS="${KEY_ALIAS:-volanteplus}"
KEYSTORE_PASS="${KEYSTORE_PASS:-volante2024}"

WEB_OUT="${WEB_OUT:-$ROOT_DIR/web/out}"
BUILD_DIR="${BUILD_DIR:-/tmp/volante-apk-build}"
DIST_DIR="$BUILD_DIR/dist"
APK_NAME="VolantePlus-v${VERSION_NAME}-webapp.apk"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

# --- 0. Pré-requisitos -------------------------------------------------------
log "Verificando toolchain"
[ -x "$AAPT2" ] || die "aapt2 não encontrado/executável em $AAPT2"
[ -f "$R8_JAR" ] || die "r8.jar não encontrado em $R8_JAR"
[ -f "$ANDROID_JAR" ] || die "android stub jar não encontrado em $ANDROID_JAR"
command -v zipalign >/dev/null || die "zipalign não está no PATH (apt install zipalign)"
command -v apksigner >/dev/null || die "apksigner não está no PATH (apt install apksigner)"
[ -d "$WEB_OUT" ] || die "export estático ausente em $WEB_OUT (rode o build do Next.js com output:'export')"
[ -f "$WEB_OUT/index.html" ] || die "$WEB_OUT existe mas não tem index.html"
echo "  aapt2      $($AAPT2 version 2>&1 | head -1)"
echo "  pacote     $APP_PACKAGE"
echo "  versão     $VERSION_NAME (versionCode $VERSION_CODE)"

# --- 1. Árvore de build ------------------------------------------------------
log "Preparando árvore de build em $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{src,res/values,obj,flat,assets/www} "$DIST_DIR"

# `-A` publica o conteúdo do diretório sob `assets/` no APK, então o export
# precisa ficar em `assets/www` para casar com ASSET_ROOT do MainActivity.
cp -r "$WEB_OUT"/. "$BUILD_DIR/assets/www/"
echo "  assets: $(find "$BUILD_DIR/assets/www" -type f | wc -l) arquivos"

# --- 2. Fontes Java ----------------------------------------------------------
log "Gerando MainActivity.java"
JAVA_PKG_DIR="$BUILD_DIR/src/${APP_PACKAGE//./\/}"
mkdir -p "$JAVA_PKG_DIR"
sed "s/^package .*/package ${APP_PACKAGE};/" \
  "$ROOT_DIR/app/src/webview/MainActivity.java" > "$JAVA_PKG_DIR/MainActivity.java"
echo "  $JAVA_PKG_DIR/MainActivity.java"

# --- 3. Manifesto e recursos -------------------------------------------------
log "Gerando AndroidManifest.xml e recursos"
# minSdk/targetSdk/versionCode/versionName vêm por flag do `aapt2 link`; se
# também estivessem aqui, os dois valores conflitariam no manifesto binário.
#
# O tema é Holo (API 11) e não Material (API 21) porque o `-I` aponta para um
# stub de android.jar anterior à API 21: `aapt2 link` resolve `@android:style/*`
# contra esse stub e falha em qualquer símbolo mais novo. Só afeta a moldura da
# Activity — a UI inteira é renderizada pelo WebView.
cat > "$BUILD_DIR/AndroidManifest.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${APP_PACKAGE}">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:label="@string/app_name"
        android:allowBackup="true"
        android:theme="@android:style/Theme.Holo.Light">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
EOF

cat > "$BUILD_DIR/res/values/strings.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${APP_LABEL}</string>
</resources>
EOF

"$AAPT2" compile --dir "$BUILD_DIR/res" -o "$BUILD_DIR/flat/res.zip"

# --- 4. Link (manifesto binário + resources.arsc + assets) -------------------
log "Linkando recursos e assets (aapt2 link)"
"$AAPT2" link \
  -o "$DIST_DIR/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$BUILD_DIR/AndroidManifest.xml" \
  -R "$BUILD_DIR/flat/res.zip" \
  -A "$BUILD_DIR/assets" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  --auto-add-overlay

# --- 5. javac -> DEX ---------------------------------------------------------
log "Compilando Java e convertendo para DEX"
javac -nowarn -source 11 -target 11 \
  -cp "$ANDROID_JAR" \
  -d "$BUILD_DIR/obj" \
  "$JAVA_PKG_DIR/MainActivity.java" 2>&1 | grep -v 'bootstrap class path' || true

find "$BUILD_DIR/obj" -name '*.class' > "$BUILD_DIR/classes.txt"
java -cp "$R8_JAR" com.android.tools.r8.D8 \
  --lib "$ANDROID_JAR" \
  --min-api "$MIN_SDK" \
  --output "$DIST_DIR" \
  @"$BUILD_DIR/classes.txt"
[ -f "$DIST_DIR/classes.dex" ] || die "d8 não produziu classes.dex"

# --- 6. Montagem -------------------------------------------------------------
log "Inserindo classes.dex no APK"
# `-j` grava sem diretório-pai: classes.dex tem de ficar na raiz do APK.
(cd "$DIST_DIR" && zip -q -j base.apk classes.dex)

# --- 7. Alinhar e assinar (nesta ordem) --------------------------------------
log "Alinhando (zipalign)"
zipalign -f -p 4 "$DIST_DIR/base.apk" "$DIST_DIR/aligned.apk"

log "Assinando (apksigner)"
[ -f "$KEYSTORE" ] || {
  echo "  keystore ausente, gerando $KEYSTORE"
  keytool -genkeypair -v -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" \
    -dname "CN=VolantePlus,OU=Dev,O=VolantePlus,L=SaoPaulo,ST=SP,C=BR" >/dev/null 2>&1
}
apksigner sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEYSTORE_PASS" \
  --key-pass "pass:$KEYSTORE_PASS" \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --out "$DIST_DIR/$APK_NAME" \
  "$DIST_DIR/aligned.apk"

# --- 8. Verificação ----------------------------------------------------------
log "Verificando APK"
APK="$DIST_DIR/$APK_NAME"
fail=0
# A listagem é capturada uma vez: com `pipefail`, `unzip -l ... | grep -q` dá
# falso negativo para entradas no começo do zip — o grep casa e sai, o unzip
# ainda escrevendo leva SIGPIPE e o pipeline inteiro vira status != 0.
listing="$(unzip -l "$APK")"
for entry in AndroidManifest.xml classes.dex resources.arsc assets/www/index.html META-INF/MANIFEST.MF; do
  if printf '%s\n' "$listing" | grep -q "[[:space:]]$entry\$"; then
    echo "  OK     $entry"
  else
    echo "  FALTA  $entry"; fail=1
  fi
done
[ "$fail" -eq 0 ] || die "APK incompleto"

apksigner verify --verbose "$APK" | head -6
"$AAPT2" dump badging "$APK" | head -6
zipalign -c -p 4 "$APK" && echo "  alinhamento OK"

log "Pronto: $APK  ($(du -h "$APK" | cut -f1))"
