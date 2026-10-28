#!/usr/bin/env bash
#
# Verificação local do teste dourado de paridade web–Kotlin (Fase 4, frente 1)
# sem Gradle e sem Android SDK — compila os fontes compartilhados relevantes,
# o teste dourado (shared/src/commonTest) e o executor local
# (scripts/kotlin-golden/GoldenMain.kt) com kotlinc, e roda tudo numa JVM.
#
# O CI (android-ci.yml) valida o MESMO teste dourado por
# `./gradlew :shared:desktopTest`; este script existe porque o ambiente de
# revisão local não tem SDK. O Kotlin 2.2.0 e as versões dos jars batem com
# gradle/libs.versions.toml.
#
# Uso:  bash scripts/kotlin-golden-check.sh
# Saída: 0 = 0 divergências; 1 = divergência dourada; 2 = ambiente.

set -euo pipefail

repoRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
toolchain="${KOTLIN_TOOLCHAIN:-$repoRoot/../kotlin-toolchain}"
out="$toolchain/golden-out"

die() { echo "ERRO: $*" >&2; exit 2; }

# --- toolchain (kotlinc 2.2.0 + kotlinx-serialization 1.7.3) ---
if [ ! -x "$toolchain/kotlinc/bin/kotlinc" ]; then
  echo "Baixando kotlin-compiler-2.2.0 (uma vez)..."
  mkdir -p "$toolchain"
  curl -sL -o "$toolchain/kotlin-compiler.zip" \
    https://github.com/JetBrains/kotlin/releases/download/v2.2.0/kotlin-compiler-2.2.0.zip \
    || die "falha ao baixar o compilador Kotlin"
  unzip -q "$toolchain/kotlin-compiler.zip" -d "$toolchain"
fi
KOTLINC="$toolchain/kotlinc/bin/kotlinc"
SERIALIZATION_VERSION=1.7.3
for artifact in kotlinx-serialization-core-jvm kotlinx-serialization-json-jvm; do
  jar="$artifact-$SERIALIZATION_VERSION.jar"
  if [ ! -f "$toolchain/$jar" ]; then
    curl -sL -o "$toolchain/$jar" \
      "https://repo1.maven.org/maven2/org/jetbrains/kotlinx/$artifact/$SERIALIZATION_VERSION/$jar"
  fi
  [ -f "$toolchain/$jar" ] || die "não consegui obter $jar"
done

# --- fontes ---
shared="$repoRoot/shared/src/commonMain/kotlin/com/volanteplus/loterias"
sources=(
  "$shared/domain/model/Lottery.kt"
  "$shared/domain/model/Generation.kt"
  "$shared/domain/backtest/NumberPerformance.kt"
  "$shared/domain/backtest/PrizeRules.kt"
  "$shared/domain/backtest/SpecialFunctions.kt"
  "$shared/domain/backtest/Hypergeometric.kt"
  "$shared/domain/backtest/PrizeTable.kt"
  "$shared/domain/generator/ClosureDesigner.kt"
  "$repoRoot/shared/src/commonTest/kotlin/com/volanteplus/loterias/golden/GoldenParityTest.kt"
  "$repoRoot/scripts/kotlin-golden/GoldenMain.kt"
)
for f in "${sources[@]}"; do [ -f "$f" ] || die "fonte ausente: $f"; done
resources="$repoRoot/shared/src/commonTest/resources"
[ -f "$resources/golden/megasena.json" ] || die "fixtures ausentes — rode scripts/generate-golden-fixtures.mjs"

# --- compila e roda ---
rm -rf "$out"
mkdir -p "$out"
echo "Compilando (${#sources[@]} fontes)..."
CP="$toolchain/kotlinx-serialization-json-jvm-$SERIALIZATION_VERSION.jar:$toolchain/kotlinx-serialization-core-jvm-$SERIALIZATION_VERSION.jar:$toolchain/kotlin-test-2.2.0.jar:$toolchain/kotlin-test-junit-2.2.0.jar:$toolchain/junit-4.13.2.jar:$toolchain/hamcrest-core-1.3.jar:$toolchain/kotlinc/lib/kotlin-test.jar"
"$KOTLINC" -cp "$CP" -d "$out" "${sources[@]}"

echo "Executando na JVM..."
java -cp "$out:$resources:$CP:$toolchain/kotlinc/lib/kotlin-stdlib.jar" \
  com.volanteplus.loterias.golden.GoldenMainKt
