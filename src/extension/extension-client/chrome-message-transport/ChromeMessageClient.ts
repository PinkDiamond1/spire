import {
  EncryptedExtensionMessage,
  ExtendedPostMessagePairingResponse,
  ExtensionMessage,
  ExtensionMessageTarget,
  MessageBasedClient,
  PostMessagePairingRequest
} from '@airgap/beacon-sdk'

export class ChromeMessageClient extends MessageBasedClient {
  protected readonly activeListeners: Map<
    string,
    (
      message: ExtensionMessage<string> | EncryptedExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => void
  > = new Map()

  public async init(): Promise<void> {
    this.subscribeToMessages().catch(console.error)
  }

  public async listenForEncryptedMessage(
    senderPublicKey: string,
    messageCallback: (
      message: ExtensionMessage<string>,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => void
  ): Promise<void> {
    if (this.activeListeners.has(senderPublicKey)) {
      return
    }

    const callbackFunction = async (
      message: ExtensionMessage<string> | EncryptedExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): Promise<void> => {
      if (message.hasOwnProperty('encryptedPayload')) {
        const encryptedMessage: EncryptedExtensionMessage = message as EncryptedExtensionMessage

        try {
          const decrypted = await this.decryptMessage(senderPublicKey, encryptedMessage.encryptedPayload)
          const decryptedMessage: ExtensionMessage<string> = {
            payload: decrypted,
            target: encryptedMessage.target,
            sender: encryptedMessage.sender
          }
          messageCallback(decryptedMessage, sender, sendResponse)
        } catch (decryptionError) {
          /* NO-OP. We try to decode every message, but some might not be addressed to us. */
        }
      }
    }

    this.activeListeners.set(senderPublicKey, callbackFunction)
  }

  public async sendMessage(
    message: string,
    peer?: PostMessagePairingRequest | ExtendedPostMessagePairingResponse
  ): Promise<void> {
    let msg: EncryptedExtensionMessage | ExtensionMessage<string> = {
      target: ExtensionMessageTarget.PAGE,
      payload: message
    }

    // If no recipient public key is provided, we respond with an unencrypted message
    if (peer && peer.publicKey) {
      const payload = await this.encryptMessage(peer.publicKey, message)

      msg = {
        target: ExtensionMessageTarget.PAGE,
        encryptedPayload: payload
      }
    }

    chrome.tabs.query({}, (tabs: chrome.tabs.Tab[]) => {
      // TODO: Find way to have direct communication with tab
      tabs.forEach(({ id }: chrome.tabs.Tab) => {
        if (id) {
          chrome.tabs.sendMessage(id, msg)
        }
      }) // Send message to all tabs
    })
  }

  public async sendPairingResponse(pairingRequest: PostMessagePairingRequest): Promise<void> {
    const pairingResponse = await this.getPairingResponseInfo(pairingRequest)

    const encryptedMessage: string = await this.encryptMessageAsymmetric(
      pairingRequest.publicKey,
      JSON.stringify(pairingResponse)
    )

    const message: ExtensionMessage<string> = {
      target: ExtensionMessageTarget.PAGE,
      payload: encryptedMessage
    }
    chrome.tabs.query({}, (tabs: chrome.tabs.Tab[]) => {
      // TODO: Find way to have direct communication with tab
      tabs.forEach(({ id }: chrome.tabs.Tab) => {
        if (id) {
          chrome.tabs.sendMessage(id, message)
        }
      }) // Send message to all tabs
    })
  }

  private async subscribeToMessages(): Promise<void> {
    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage<string> | EncryptedExtensionMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => {
        this.activeListeners.forEach(listener => {
          listener(message, sender, sendResponse)
        })

        // return true from the event listener to indicate you wish to send a response asynchronously
        // (this will keep the message channel open to the other end until sendResponse is called).
        return true
      }
    )
  }
}
