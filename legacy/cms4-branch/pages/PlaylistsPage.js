export class PlaylistsPage {
  constructor(page) {
    this.page = page;
    this.playlistMenu = page.locator('text=Playlists');
    this.createPlaylistBtn = page.locator('button:has-text("Create Playlist")');
    this.playlistName = page.locator('#playlist-name');
    this.saveBtn = page.locator('button:has-text("Save")');
  }
  async openPlaylists() {
    await this.playlistMenu.click();
    await this.page.waitForLoadState('networkidle');
  }
  async createPlaylist(name) {
    await this.createPlaylistBtn.click();
    await this.playlistName.fill(name);
    await this.saveBtn.click();
  }
}