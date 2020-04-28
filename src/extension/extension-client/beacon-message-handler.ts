import {
  BeaconBaseMessage,
  BeaconMessageType,
  BroadcastRequestOutput,
  BroadcastResponse,
  BroadcastResponseInput,
  ChromeStorage,
  OperationRequestOutput,
  OperationResponse,
  OperationResponseInput,
  PermissionRequestOutput,
  PermissionResponse,
  PermissionResponseInput,
  PermissionScope,
  Serializer,
  SignPayloadRequestOutput,
  SignPayloadResponse,
  SignPayloadResponseInput
} from '@airgap/beacon-sdk'
import { TezosProtocol } from 'airgap-coin-lib'
import { TezosWrappedOperation } from 'airgap-coin-lib/dist/protocols/tezos/types/TezosWrappedOperation'
import { RawTezosTransaction } from 'airgap-coin-lib/dist/serializer/types'

import { ExtensionClient } from './ExtensionClient'
import { Logger } from './Logger'
import { getProtocolForNetwork } from './utils'

const logger: Logger = new Logger('BeaconMessageHandler')
const storage: ChromeStorage = new ChromeStorage()

const beaconMessageHandlerNotSupported: (
  data: { request: BeaconBaseMessage; extras: unknown },
  sendToPage: (message: string) => void,
  sendResponse: () => void
) => Promise<void> = (): Promise<void> => Promise.resolve()

export type BeaconMessageHandlerFunction = (
  data: { request: BeaconBaseMessage; extras: unknown },
  sendToPage: (message: string) => void,
  sendResponse: () => void
) => Promise<void>

export class BeaconMessageHandler {
  public beaconMessageHandler: { [key in BeaconMessageType]: BeaconMessageHandlerFunction } = {
    [BeaconMessageType.PermissionRequest]: async (
      data: { request: BeaconBaseMessage; extras: unknown },
      sendToPage: (message: string) => void,
      sendResponse: Function
    ): Promise<void> => {
      logger.log('beaconMessageHandler permission-response', data)
      const request: PermissionRequestOutput = (data.request as any) as PermissionRequestOutput
      const extras: {
        pubkey: string
        accountIdentifier: string
        scopes: PermissionScope[]
      } = data.extras as any

      const responseInput: PermissionResponseInput = {
        id: request.id,
        type: BeaconMessageType.PermissionResponse,
        accountIdentifier: extras.accountIdentifier,
        pubkey: extras.pubkey,
        network: {
          ...request.network
        },
        scopes: extras.scopes
      }

      const response: PermissionResponse = { beaconId: '0', version: '0', ...responseInput }

      sendToPage(await new Serializer().serialize(response))
      sendResponse()
    },
    [BeaconMessageType.OperationRequest]: async (
      data: { request: BeaconBaseMessage; extras: unknown },
      sendToPage: (message: string) => void,
      sendResponse: () => void
    ): Promise<void> => {
      const operationRequest: OperationRequestOutput = (data.request as any) as OperationRequestOutput
      logger.log('beaconMessageHandler operation-request', data)
      const protocol: TezosProtocol = await getProtocolForNetwork(operationRequest.network)

      const mnemonic: string = await storage.get('mnemonic' as any)

      const publicKey: string = await protocol.getPublicKeyFromMnemonic(mnemonic, protocol.standardDerivationPath)
      const operation: TezosWrappedOperation = await protocol.prepareOperations(
        publicKey,
        operationRequest.operationDetails
      )

      const forgedTx: RawTezosTransaction = await protocol.forgeAndWrapOperations(operation)
      logger.log(JSON.stringify(forgedTx))

      let responseInput: OperationResponseInput
      try {
        const hash: string = await this.client.signer
          .sign(forgedTx.binaryTransaction, mnemonic)
          .then((signedTx: string) => {
            return this.client.signer.broadcast(operationRequest.network, signedTx)
          })
        logger.log('broadcast: ', hash)
        responseInput = {
          id: operationRequest.id,
          type: BeaconMessageType.OperationResponse,
          transactionHash: hash
        }
      } catch (error) {
        logger.log('sending ERROR', error)
        responseInput = {
          id: operationRequest.id,
          type: BeaconMessageType.OperationResponse,
          errorType: error
        } as any
      }

      const response: OperationResponse = { beaconId: '0', version: '0', ...responseInput }

      sendToPage(await new Serializer().serialize(response))
      sendResponse()
    },
    [BeaconMessageType.SignPayloadRequest]: async (
      data: { request: BeaconBaseMessage; extras: unknown },
      sendToPage: (message: string) => void,
      sendResponse: () => void
    ): Promise<void> => {
      const signRequest: SignPayloadRequestOutput = (data.request as any) as SignPayloadRequestOutput
      logger.log('beaconMessageHandler sign-request', data)
      const mnemonic: string = await storage.get('mnemonic' as any)

      const signature: string = await this.client.signer.sign(signRequest.payload[0], mnemonic)
      logger.log('signed: ', signature)
      const responseInput: SignPayloadResponseInput = {
        id: signRequest.id,
        type: BeaconMessageType.SignPayloadResponse,
        signature
      }

      const response: SignPayloadResponse = { beaconId: '0', version: '0', ...responseInput }

      sendToPage(await new Serializer().serialize(response))
      sendResponse()
    },
    [BeaconMessageType.BroadcastRequest]: async (
      data: { request: BeaconBaseMessage; extras: unknown },
      sendToPage: (message: string) => void,
      sendResponse: () => void
    ): Promise<void> => {
      const broadcastRequest: BroadcastRequestOutput = (data.request as any) as BroadcastRequestOutput
      logger.log('beaconMessageHandler broadcast-request', broadcastRequest)
      const hash: string = await this.client.signer.broadcast(
        broadcastRequest.network,
        broadcastRequest.signedTransaction
      )
      logger.log('broadcast: ', hash)
      const responseInput: BroadcastResponseInput = {
        id: broadcastRequest.id,
        type: BeaconMessageType.BroadcastResponse,
        transactionHash: hash
      }

      const response: BroadcastResponse = { beaconId: '0', version: '0', ...responseInput }

      sendToPage(await new Serializer().serialize(response))
      sendResponse()
    },
    [BeaconMessageType.PermissionResponse]: beaconMessageHandlerNotSupported,
    [BeaconMessageType.OperationResponse]: beaconMessageHandlerNotSupported,
    [BeaconMessageType.SignPayloadResponse]: beaconMessageHandlerNotSupported,
    [BeaconMessageType.BroadcastResponse]: beaconMessageHandlerNotSupported
  }

  constructor(private readonly client: ExtensionClient) {
    /* */
  }

  public async handle(key: BeaconMessageType): Promise<BeaconMessageHandlerFunction> {
    return this.beaconMessageHandler[key]
  }
}
