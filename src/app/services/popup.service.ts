import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class PopupService {
  private closeTimeout: NodeJS.Timeout | undefined

  public async close(time: number): Promise<void> {
    this.closeTimeout = setTimeout(() => {
      window.close()
    }, time)
  }

  public async cancelClose(): Promise<void> {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout)
    }
  }
}
