import { Network, NetworkType } from '@airgap/beacon-sdk'
import { Component } from '@angular/core'
import { ToastController } from '@ionic/angular'
import { ChromeMessagingService } from 'src/app/services/chrome-messaging.service'
import { Action, ExtensionMessageOutputPayload } from 'src/extension/extension-client/Actions'

import { SettingsService } from '../../services/settings.service'

@Component({
  selector: 'beacon-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss']
})
export class SettingsPage {
  public networkType: NetworkType = NetworkType.MAINNET
  public networkName: string | undefined
  public networkRpcUrl: string | undefined
  public beaconId: string | undefined

  constructor(
    public readonly settingsService: SettingsService,
    public readonly chromeMessagingService: ChromeMessagingService,
    private readonly toastController: ToastController
  ) {
    this.settingsService
      .getNetwork()
      .then((network: Network | undefined) => {
        if (network) {
          this.networkType = network.type
          this.networkName = network.name
          this.networkRpcUrl = network.rpcUrl
        }
      })
      .catch(console.error)

    this.chromeMessagingService
      .sendChromeMessage(Action.BEACON_ID_GET, undefined)
      .then((data: ExtensionMessageOutputPayload<Action.BEACON_ID_GET>) => {
        if (data.data) {
          this.beaconId = data.data.id
        }
      })
      .catch((chromeMessagingError: Error) => {
        console.error(chromeMessagingError)
      })
  }

  public async updateNetworkType() {
    if (this.networkType === NetworkType.CUSTOM) {
      return
    } else {
      this.updateNetwork()
    }
  }

  public async updateNetwork(): Promise<void> {
    return this.settingsService
      .setNetwork({
        type: this.networkType,
        name: this.networkName,
        rpcUrl: this.networkRpcUrl
      })
      .then(async () => {
        const toast = await this.toastController.create({ message: 'Network updated', duration: 1000 })

        return toast.present()
      })
  }
}
