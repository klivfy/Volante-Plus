package com.volanteplus.loterias.data.local

import androidx.room.TypeConverter

/**
 * Conversores Room. Listas de inteiros são persistidas como CSV ("4,12,23");
 * lista vazia vira string vazia. Enums usam a conversão nativa do Room.
 */
class Converters {

    @TypeConverter
    fun intListToString(values: List<Int>): String = values.joinToString(",")

    @TypeConverter
    fun stringToIntList(value: String): List<Int> =
        if (value.isEmpty()) emptyList() else value.split(",").map(String::toInt)
}
