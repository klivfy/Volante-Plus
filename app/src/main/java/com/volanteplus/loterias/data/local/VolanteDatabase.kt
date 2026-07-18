package com.volanteplus.loterias.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(entities = [DrawEntity::class], version = 1, exportSchema = false)
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
                ).build().also { instance = it }
            }
    }
}
