package com.volanteplus.loterias.data.local

import org.junit.Assert.assertEquals
import org.junit.Test

class ConvertersTest {

    private val converters = Converters()

    @Test
    fun `round-trip de lista de dezenas`() {
        val numbers = listOf(4, 12, 23, 34, 45, 56)
        assertEquals(numbers, converters.stringToIntList(converters.intListToString(numbers)))
    }

    @Test
    fun `lista vazia vira string vazia e volta`() {
        assertEquals("", converters.intListToString(emptyList()))
        assertEquals(emptyList<Int>(), converters.stringToIntList(""))
    }

    @Test
    fun `formato persistido e csv simples`() {
        assertEquals("1,2,3", converters.intListToString(listOf(1, 2, 3)))
    }
}
