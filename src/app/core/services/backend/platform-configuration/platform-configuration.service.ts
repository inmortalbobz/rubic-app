import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ENVIRONMENT } from 'src/environments/environment';
import {
  BackendBlockchain,
  FROM_BACKEND_BLOCKCHAINS
} from '@app/shared/constants/blockchain/backend-blockchains';
import { BehaviorSubject, catchError, map, Observable, of, tap } from 'rxjs';
import {
  BlockchainName,
  CROSS_CHAIN_TRADE_TYPE,
  CrossChainTradeType,
  LifiBridgeTypes,
  RangoBridgeTypes
} from 'rubic-sdk';
import { FROM_BACKEND_CROSS_CHAIN_PROVIDERS } from '../cross-chain-routing-api/constants/from-backend-cross-chain-providers';

interface CrossChainProviderStatus {
  active: boolean;
  disabledProviders: string[];
}

interface PlatformConfig {
  server_is_active: boolean;
  networks: {
    [chain: string]: boolean;
  };
  cross_chain_providers: {
    [provider: string]: CrossChainProviderStatus;
  };
  on_chain_providers: {
    proxy: {
      active: boolean;
    };
  };
}

interface DisabledBridgeTypes {
  [CROSS_CHAIN_TRADE_TYPE.RANGO]: RangoBridgeTypes[];
  [CROSS_CHAIN_TRADE_TYPE.LIFI]: LifiBridgeTypes[];
}

interface ProvidersConfiguration {
  disabledBridgeTypes: DisabledBridgeTypes;
  disabledCrossChainTradeTypes: CrossChainTradeType[];
}

@Injectable({
  providedIn: 'root'
})
export class PlatformConfigurationService {
  private readonly _disabledProviders$ = new BehaviorSubject<ProvidersConfiguration>({
    disabledBridgeTypes: undefined,
    disabledCrossChainTradeTypes: undefined
  });

  public readonly disabledProviders$ = this._disabledProviders$.asObservable();

  public get disabledProviders(): ProvidersConfiguration {
    return this._disabledProviders$.getValue();
  }

  private readonly _availableBlockchains$ = new BehaviorSubject<BlockchainName[]>(undefined);

  public readonly availableBlockchains$ = this._availableBlockchains$.asObservable();

  public get availableBlockchains(): BlockchainName[] {
    return this._availableBlockchains$.getValue();
  }

  private readonly _useOnChainProxy$ = new BehaviorSubject<boolean>(undefined);

  public readonly useOnChainProxy$ = this._useOnChainProxy$.asObservable();

  public get useOnChainProxy(): boolean {
    return this._useOnChainProxy$.getValue();
  }

  constructor(private httpClient: HttpClient) {}

  public loadPlatformConfig(): Observable<boolean> {
    return this.httpClient.get<PlatformConfig>(`${ENVIRONMENT.apiBaseUrl}/info/status_info`).pipe(
      tap(response => {
        if (response.server_is_active === true) {
          this._availableBlockchains$.next(this.mapAvailableBlockchains(response.networks));
          this._disabledProviders$.next(this.mapDisabledProviders(response.cross_chain_providers));
          this._useOnChainProxy$.next(response.on_chain_providers.proxy.active);
        }
      }),
      map(response => response.server_is_active),
      catchError(() => of(true))
    );
  }

  public isAvailableBlockchain(blockchain: BlockchainName): boolean {
    return this.availableBlockchains ? this.availableBlockchains.includes(blockchain) : true;
  }

  private mapAvailableBlockchains(availableBlockchains: {
    [chain: string]: boolean;
  }): BlockchainName[] {
    return Object.entries(availableBlockchains)
      .filter(([_, availability]) => availability)
      .map(([blockchain]) => FROM_BACKEND_BLOCKCHAINS[blockchain as BackendBlockchain]);
  }

  private mapDisabledProviders(crossChainProviders: {
    [key: string]: CrossChainProviderStatus;
  }): ProvidersConfiguration {
    const crossChainProvidersEntries = Object.entries(crossChainProviders);

    if (!crossChainProvidersEntries.length) {
      return { disabledBridgeTypes: undefined, disabledCrossChainTradeTypes: undefined };
    }

    const disabledCrossChainProviders = crossChainProvidersEntries
      .filter(([_, { active }]) => !active)
      .map(([providerName]) => FROM_BACKEND_CROSS_CHAIN_PROVIDERS[providerName])
      .filter(provider => Boolean(provider));

    const disabledBridgeTypes = crossChainProvidersEntries
      .filter(([_, { disabledProviders, active }]) => Boolean(disabledProviders.length && active))
      .reduce((acc, [providerName, { disabledProviders }]) => {
        if (FROM_BACKEND_CROSS_CHAIN_PROVIDERS[providerName] === CROSS_CHAIN_TRADE_TYPE.RANGO) {
          acc[CROSS_CHAIN_TRADE_TYPE.RANGO] = disabledProviders as RangoBridgeTypes[];
        }

        if (FROM_BACKEND_CROSS_CHAIN_PROVIDERS[providerName] === CROSS_CHAIN_TRADE_TYPE.LIFI) {
          acc[CROSS_CHAIN_TRADE_TYPE.LIFI] = disabledProviders as LifiBridgeTypes[];
        }

        return acc;
      }, {} as DisabledBridgeTypes);

    return { disabledBridgeTypes, disabledCrossChainTradeTypes: disabledCrossChainProviders };
  }
}
