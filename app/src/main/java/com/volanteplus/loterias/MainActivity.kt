package com.volanteplus.loterias

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.volanteplus.loterias.ui.theme.VolantePlusTheme
import com.volanteplus.loterias.ui.volante.VolanteScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            VolantePlusTheme {
                VolanteScreen()
            }
        }
    }
}
