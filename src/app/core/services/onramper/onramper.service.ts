import { Injectable } from '@angular/core';
import { RecentTradesStoreService } from '@core/services/recent-trades/recent-trades-store.service';
import BigNumber from 'bignumber.js';
import { GasService } from '@core/services/gas-service/gas.service';
import { onChainProxyMaxGasLimit } from '@core/services/onramper/constants/on-chain-proxy-max-gas-limit';
import { SwapFormService } from '@core/services/swaps/swap-form.service';
import { TokensService } from '@core/services/tokens/tokens.service';
import {
  EvmBlockchainName,
  EvmWeb3Pure,
  nativeTokensList,
  OnChainProxyService,
  PriceTokenAmount
} from 'rubic-sdk';
import { QueryParamsService } from '@core/services/query-params/query-params.service';

@Injectable({
  providedIn: 'root'
})
export class OnramperService {
  constructor(
    private readonly recentTradesStoreService: RecentTradesStoreService,
    private readonly gasService: GasService,
    private readonly swapFormService: SwapFormService,
    private readonly tokensService: TokensService,
    private readonly queryParamsService: QueryParamsService
  ) {}

  public async updateSwapFormByRecentTrade(txId: string): Promise<void> {
    const trade = this.recentTradesStoreService.getSpecificOnramperTrade(txId);
    if (!trade) {
      return;
    }

    const blockchain = trade.toToken.blockchain as EvmBlockchainName;
    const nativeToken = await this.tokensService.findToken({
      address: EvmWeb3Pure.nativeTokenAddress,
      blockchain
    });

    const fromFee = await this.getFromFees(blockchain);
    const fromAmount = new BigNumber(trade.nativeAmount).minus(fromFee);

    const toToken = await this.tokensService.findToken(trade.toToken);

    this.swapFormService.inputControl.patchValue({
      fromAssetType: blockchain,
      fromAsset: nativeToken,
      toBlockchain: blockchain,
      toToken,
      fromAmount
    });

    this.queryParamsService.patchQueryParams({ onramperTxId: txId });
  }

  public async getFromFees(blockchain: EvmBlockchainName): Promise<BigNumber> {
    const gasPrice = await this.gasService.getGasPriceInEthUnits(blockchain);
    const gasFee = gasPrice.multipliedBy(onChainProxyMaxGasLimit);

    const nativeToken = nativeTokensList[blockchain] as PriceTokenAmount<EvmBlockchainName>;
    const onChainProxyFee = await new OnChainProxyService().getFeeInfo(
      new PriceTokenAmount<EvmBlockchainName>(nativeToken),
      EvmWeb3Pure.EMPTY_ADDRESS
    );
    const fixedFee = onChainProxyFee.fixedFeeToken.tokenAmount;

    return gasFee.plus(fixedFee);
  }
}
