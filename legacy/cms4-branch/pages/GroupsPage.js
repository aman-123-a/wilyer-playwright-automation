export class GroupsPage {
  constructor(page) {
    this.page = page;
    this.groupsMenu = page.locator('text=Groups');
    this.createGroupBtn = page.locator('button:has-text("Create Group")');
    this.groupNameInput = page.locator('#group-name');
    this.saveBtn = page.locator('button:has-text("Save")');
    this.cloneBtn = page.locator('button:has-text("Clone")');
  }
  async openGroups() {
    await this.groupsMenu.click();
    await this.page.waitForLoadState('networkidle');
  }
  async createGroup(name) {
    await this.createGroupBtn.click();
    await this.groupNameInput.fill(name);
    await this.saveBtn.click();
  }
  async cloneGroup(name) {
    await this.page.locator(`text=${name}`).click();
    await this.cloneBtn.click();
    await this.page.locator('#clone-name').fill(`${name}-clone`);
    await this.saveBtn.click();
  }
}