package com.volanteplus.loterias

import android.app.Application
import com.volanteplus.loterias.data.local.VolanteDatabase
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.data.repository.RoomDrawRepository

/**
 * Container manual de dependências (sem framework de DI nesta fase).
 * Acesso via `(context.applicationContext as VolanteApplication).drawRepository`.
 */
class VolanteApplication : Application() {

    val drawRepository: DrawRepository by lazy {
        RoomDrawRepository(VolanteDatabase.getInstance(this).drawDao())
    }
}
