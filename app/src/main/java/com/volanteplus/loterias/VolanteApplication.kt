package com.volanteplus.loterias

import android.app.Application
import com.volanteplus.loterias.data.local.VolanteDatabase
import com.volanteplus.loterias.domain.backtest.BacktestEngine
import com.volanteplus.loterias.data.remote.CaixaLotteryApi
import com.volanteplus.loterias.data.remote.HttpCaixaLotteryApi
import com.volanteplus.loterias.data.repository.DrawRepository
import com.volanteplus.loterias.data.repository.RoomDrawRepository
import com.volanteplus.loterias.data.seed.AssetDrawSeeder
import com.volanteplus.loterias.domain.usecase.GetNextDrawInfoUseCase
import com.volanteplus.loterias.domain.usecase.SyncDrawHistory

/**
 * Container manual de dependências (sem framework de DI nesta fase).
 * Acesso via `(context.applicationContext as VolanteApplication).drawRepository`.
 */
class VolanteApplication : Application() {

    val drawRepository: DrawRepository by lazy {
        RoomDrawRepository(VolanteDatabase.getInstance(this).drawDao())
    }

    val caixaApi: CaixaLotteryApi by lazy { HttpCaixaLotteryApi() }

    val drawSeeder: AssetDrawSeeder by lazy { AssetDrawSeeder(this, drawRepository) }

    val syncDrawHistory: SyncDrawHistory by lazy { SyncDrawHistory(drawRepository, caixaApi) }

    val backtestEngine: BacktestEngine by lazy { BacktestEngine(drawRepository) }

    val getNextDrawInfo: GetNextDrawInfoUseCase by lazy { GetNextDrawInfoUseCase(caixaApi) }
}
