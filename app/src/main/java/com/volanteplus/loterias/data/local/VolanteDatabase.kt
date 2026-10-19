package com.volanteplus.loterias.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

/**
 * Banco local do histórico de concursos.
 *
 * ## Política de migração
 * `exportSchema = true` grava o schema versionado em `app/schemas/` (ver
 * `app/build.gradle.kts`), que é o insumo para escrever e testar migrações —
 * sem ele, o Room não consegue validar um upgrade.
 *
 * Enquanto não houver migração escrita, [fallbackToDestructiveMigration] é
 * **explícito**: ao subir a versão do schema, o banco é recriado vazio. É uma
 * decisão deliberada e segura aqui porque o conteúdo é 100% reconstruível
 * (seed em `assets/seed/` + sincronização com a API da Caixa) — nada que o
 * usuário tenha digitado mora neste banco. Sem esta linha, o comportamento
 * padrão do Room no primeiro bump de versão seria **crashar no upgrade** de
 * quem já tem o app instalado.
 *
 * Ao introduzir a versão 2, prefira uma [androidx.room.migration.Migration]
 * de verdade e remova o fallback.
 */
@Database(entities = [DrawEntity::class], version = 1, exportSchema = true)
@TypeConverters(Converters::class)
abstract class VolanteDatabase : RoomDatabase() {

    abstract fun drawDao(): DrawDao

    companion object {
        private const val DATABASE_NAME = "volante-plus.db"

        @Volatile
        private var instance: VolanteDatabase? = null

        fun getInstance(context: Context): VolanteDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    VolanteDatabase::class.java,
                    DATABASE_NAME,
                )
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                    .also { instance = it }
            }
    }
}
