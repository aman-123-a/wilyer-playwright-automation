# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rbac\role-permissions.spec.ts >> RBAC — permission constraints >> converting unrestricted → restricted enforces parent + permission subset
- Location: tests\rbac\role-permissions.spec.ts:44:7

# Error details

```
Error: expected submit to be rejected (dialog should stay open)

expect(received).toBeFalsy()

Received: true
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - link [ref=e8] [cursor=pointer]:
          - /url: /
        - list [ref=e10]:
          - listitem [ref=e11]:
            - link " Dashboard" [ref=e12] [cursor=pointer]:
              - /url: /
              - generic [ref=e13]: 
              - text: Dashboard
          - listitem [ref=e14]:
            - link " Screens" [ref=e15] [cursor=pointer]:
              - /url: /screens
              - generic [ref=e16]: 
              - text: Screens
          - listitem [ref=e17]:
            - link " Groups" [ref=e18] [cursor=pointer]:
              - /url: /groups
              - generic [ref=e19]: 
              - text: Groups
          - listitem [ref=e20]:
            - link " Clusters" [ref=e21] [cursor=pointer]:
              - /url: /clusters
              - generic [ref=e22]: 
              - text: Clusters
          - listitem [ref=e23]:
            - link " Library" [ref=e24] [cursor=pointer]:
              - /url: /library
              - generic [ref=e25]: 
              - text: Library
          - listitem [ref=e26]:
            - link " Playlists" [ref=e27] [cursor=pointer]:
              - /url: /playlists
              - generic [ref=e28]: 
              - text: Playlists
          - listitem [ref=e29]:
            - link " Team" [ref=e30] [cursor=pointer]:
              - /url: /team
              - generic [ref=e31]: 
              - text: Team
          - listitem [ref=e32]:
            - link " Reports" [ref=e33] [cursor=pointer]:
              - /url: /reports
              - generic [ref=e34]: 
              - text: Reports
          - separator [ref=e35]
          - listitem [ref=e36]:
            - link " Help" [ref=e37] [cursor=pointer]:
              - /url: /help
              - generic [ref=e38]: 
              - text: Help
          - listitem [ref=e39]:
            - link " Feedback" [ref=e40] [cursor=pointer]:
              - /url: /feedback
              - generic [ref=e41]: 
              - text: Feedback
          - listitem [ref=e42]:
            - link " Billing" [ref=e43] [cursor=pointer]:
              - /url: /billing
              - generic [ref=e44]: 
              - text: Billing
          - listitem [ref=e45]:
            - link " Account" [ref=e46] [cursor=pointer]:
              - /url: /account
              - generic [ref=e47]: 
              - text: Account
          - listitem [ref=e48]:
            - link " Logout" [ref=e49] [cursor=pointer]:
              - /url: /
              - generic [ref=e50]: 
              - text: Logout
      - generic [ref=e52]:
        - generic "dev" [ref=e54]:
          - generic [ref=e56]: D
        - generic [ref=e57]: dev@wilyer.com
      - generic [ref=e58]: v3.5.20
    - generic [ref=e61]:
      - generic [ref=e62]:
        - list [ref=e65]:
          - listitem [ref=e66]:
            - link "Members" [ref=e67] [cursor=pointer]:
              - /url: /team
          - listitem [ref=e68]:
            - link "Roles" [ref=e69] [cursor=pointer]:
              - /url: /team
          - listitem [ref=e70]:
            - link "New Member" [ref=e71] [cursor=pointer]:
              - /url: /team
          - listitem [ref=e72]:
            - link "Logs" [ref=e73] [cursor=pointer]:
              - /url: /team
        - generic [ref=e74]:
          - textbox "Search..." [ref=e75]
          - button "Read Docs " [ref=e76] [cursor=pointer]:
            - text: Read Docs
            - generic [ref=e77]: 
      - generic [ref=e78]:
        - generic [ref=e79]:
          - generic [ref=e80]:
            - heading "Custom Role Management" [level=4] [ref=e81]
            - paragraph [ref=e82]: Create and manage custom roles with specific permissions
          - generic [ref=e83]:
            - tablist [ref=e86]:
              - button " Card View" [ref=e87] [cursor=pointer]:
                - generic [ref=e88]: 
                - text: Card View
            - button " Create Custom Role" [ref=e89] [cursor=pointer]:
              - generic [ref=e90]: 
              - text: Create Custom Role
        - generic [ref=e91]:
          - generic [ref=e94]:
            - generic [ref=e95]:
              - heading "Convert_Parent_1776858553052_7792" [level=5] [ref=e96]
              - paragraph
              - generic [ref=e97]:
                - generic [ref=e98]: 9 Permissions
                - generic [ref=e99]: "Reports To: Owner"
            - generic [ref=e100]:
              - heading "Key Modules:" [level=6] [ref=e101]
              - generic [ref=e102]:
                - generic [ref=e103]: Screens
                - generic [ref=e104]: Screens Actions
              - generic [ref=e105]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e106]:
                  - generic [ref=e107]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e108]: "Created: 4/22/2026"
            - generic [ref=e110]:
              - button " View" [ref=e111] [cursor=pointer]:
                - generic [ref=e112]: 
                - text: View
              - button " Edit" [ref=e113] [cursor=pointer]:
                - generic [ref=e114]: 
                - text: Edit
              - button " Delete" [ref=e115] [cursor=pointer]:
                - generic [ref=e116]: 
                - text: Delete
          - generic [ref=e119]:
            - generic [ref=e120]:
              - heading "PermParent_1776858527002_2572" [level=5] [ref=e121]
              - paragraph
              - generic [ref=e122]:
                - generic [ref=e123]: 9 Permissions
                - generic [ref=e124]: "Reports To: Owner"
            - generic [ref=e125]:
              - heading "Key Modules:" [level=6] [ref=e126]
              - generic [ref=e127]:
                - generic [ref=e128]: Screens
                - generic [ref=e129]: Screens Actions
              - generic [ref=e130]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e131]:
                  - generic [ref=e132]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e133]: "Created: 4/22/2026"
            - generic [ref=e135]:
              - button " View" [ref=e136] [cursor=pointer]:
                - generic [ref=e137]: 
                - text: View
              - button " Edit" [ref=e138] [cursor=pointer]:
                - generic [ref=e139]: 
                - text: Edit
              - button " Delete" [ref=e140] [cursor=pointer]:
                - generic [ref=e141]: 
                - text: Delete
          - generic [ref=e144]:
            - generic [ref=e145]:
              - heading "DelChild_1776858488363_604" [level=5] [ref=e146]
              - paragraph
              - generic [ref=e147]:
                - generic [ref=e148]: 9 Permissions
                - generic [ref=e149]: Restricted
                - generic [ref=e150]: "Reports To: DelParent_1776858488363_3400"
            - generic [ref=e151]:
              - heading "Key Modules:" [level=6] [ref=e152]
              - generic [ref=e153]:
                - generic [ref=e154]: Screens
                - generic [ref=e155]: Screens Actions
              - generic [ref=e156]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e157]:
                  - generic [ref=e158]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e159]: "Created: 4/22/2026"
            - generic [ref=e161]:
              - button " View" [ref=e162] [cursor=pointer]:
                - generic [ref=e163]: 
                - text: View
              - button " Edit" [ref=e164] [cursor=pointer]:
                - generic [ref=e165]: 
                - text: Edit
              - button " Delete" [ref=e166] [cursor=pointer]:
                - generic [ref=e167]: 
                - text: Delete
          - generic [ref=e170]:
            - generic [ref=e171]:
              - heading "DelParent_1776858488363_3400" [level=5] [ref=e172]
              - paragraph
              - generic [ref=e173]:
                - generic [ref=e174]: 9 Permissions
                - generic [ref=e175]: "Reports To: Owner"
            - generic [ref=e176]:
              - heading "Key Modules:" [level=6] [ref=e177]
              - generic [ref=e178]:
                - generic [ref=e179]: Screens
                - generic [ref=e180]: Screens Actions
              - generic [ref=e181]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e182]:
                  - generic [ref=e183]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e184]: "Created: 4/22/2026"
            - generic [ref=e186]:
              - button " View" [ref=e187] [cursor=pointer]:
                - generic [ref=e188]: 
                - text: View
              - button " Edit" [ref=e189] [cursor=pointer]:
                - generic [ref=e190]: 
                - text: Edit
              - button " Delete" [ref=e191] [cursor=pointer]:
                - generic [ref=e192]: 
                - text: Delete
          - generic [ref=e195]:
            - generic [ref=e196]:
              - heading "Cyc_A_1776858393356_7680" [level=5] [ref=e197]
              - paragraph
              - generic [ref=e198]:
                - generic [ref=e199]: 9 Permissions
                - generic [ref=e200]: "Reports To: Owner"
            - generic [ref=e201]:
              - heading "Key Modules:" [level=6] [ref=e202]
              - generic [ref=e203]:
                - generic [ref=e204]: Screens
                - generic [ref=e205]: Screens Actions
              - generic [ref=e206]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e207]:
                  - generic [ref=e208]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e209]: "Created: 4/22/2026"
            - generic [ref=e211]:
              - button " View" [ref=e212] [cursor=pointer]:
                - generic [ref=e213]: 
                - text: View
              - button " Edit" [ref=e214] [cursor=pointer]:
                - generic [ref=e215]: 
                - text: Edit
              - button " Delete" [ref=e216] [cursor=pointer]:
                - generic [ref=e217]: 
                - text: Delete
          - generic [ref=e220]:
            - generic [ref=e221]:
              - heading "Parent_U_1776858373871_6673" [level=5] [ref=e222]
              - paragraph
              - generic [ref=e223]:
                - generic [ref=e224]: 9 Permissions
                - generic [ref=e225]: "Reports To: Owner"
            - generic [ref=e226]:
              - heading "Key Modules:" [level=6] [ref=e227]
              - generic [ref=e228]:
                - generic [ref=e229]: Screens
                - generic [ref=e230]: Screens Actions
              - generic [ref=e231]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e232]:
                  - generic [ref=e233]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e234]: "Created: 4/22/2026"
            - generic [ref=e236]:
              - button " View" [ref=e237] [cursor=pointer]:
                - generic [ref=e238]: 
                - text: View
              - button " Edit" [ref=e239] [cursor=pointer]:
                - generic [ref=e240]: 
                - text: Edit
              - button " Delete" [ref=e241] [cursor=pointer]:
                - generic [ref=e242]: 
                - text: Delete
          - generic [ref=e245]:
            - generic [ref=e246]:
              - heading "R_NoParent_1776858358743_6220" [level=5] [ref=e247]
              - paragraph
              - generic [ref=e248]:
                - generic [ref=e249]: 56 Permissions
                - generic [ref=e250]: Restricted
                - generic [ref=e251]: "Reports To: Owner"
            - generic [ref=e252]:
              - heading "Key Modules:" [level=6] [ref=e253]
              - generic [ref=e254]:
                - generic [ref=e255]: Dashboard Stats
                - generic [ref=e256]: Media (Img/Vid)
                - generic [ref=e257]: Widgets
                - generic [ref=e258]: Media Sets
                - generic [ref=e259]: +11 more
              - generic [ref=e260]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e261]:
                  - generic [ref=e262]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e263]: "Created: 4/22/2026"
            - generic [ref=e265]:
              - button " View" [ref=e266] [cursor=pointer]:
                - generic [ref=e267]: 
                - text: View
              - button " Edit" [ref=e268] [cursor=pointer]:
                - generic [ref=e269]: 
                - text: Edit
              - button " Delete" [ref=e270] [cursor=pointer]:
                - generic [ref=e271]: 
                - text: Delete
          - generic [ref=e274]:
            - generic [ref=e275]:
              - heading "Self_1776858153151_5606" [level=5] [ref=e276]
              - paragraph
              - generic [ref=e277]:
                - generic [ref=e278]: 56 Permissions
                - generic [ref=e279]: "Reports To: Owner"
            - generic [ref=e280]:
              - heading "Key Modules:" [level=6] [ref=e281]
              - generic [ref=e282]:
                - generic [ref=e283]: Dashboard Stats
                - generic [ref=e284]: Media (Img/Vid)
                - generic [ref=e285]: Widgets
                - generic [ref=e286]: Media Sets
                - generic [ref=e287]: +11 more
              - generic [ref=e288]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e289]:
                  - generic [ref=e290]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e291]: "Created: 4/22/2026"
            - generic [ref=e293]:
              - button " View" [ref=e294] [cursor=pointer]:
                - generic [ref=e295]: 
                - text: View
              - button " Edit" [ref=e296] [cursor=pointer]:
                - generic [ref=e297]: 
                - text: Edit
              - button " Delete" [ref=e298] [cursor=pointer]:
                - generic [ref=e299]: 
                - text: Delete
          - generic [ref=e302]:
            - generic [ref=e303]:
              - heading "Cyc_A_1776858100815_8931" [level=5] [ref=e304]
              - paragraph
              - generic [ref=e305]:
                - generic [ref=e306]: 9 Permissions
                - generic [ref=e307]: "Reports To: Owner"
            - generic [ref=e308]:
              - heading "Key Modules:" [level=6] [ref=e309]
              - generic [ref=e310]:
                - generic [ref=e311]: Screens
                - generic [ref=e312]: Screens Actions
              - generic [ref=e313]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e314]:
                  - generic [ref=e315]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e316]: "Created: 4/22/2026"
            - generic [ref=e318]:
              - button " View" [ref=e319] [cursor=pointer]:
                - generic [ref=e320]: 
                - text: View
              - button " Edit" [ref=e321] [cursor=pointer]:
                - generic [ref=e322]: 
                - text: Edit
              - button " Delete" [ref=e323] [cursor=pointer]:
                - generic [ref=e324]: 
                - text: Delete
          - generic [ref=e327]:
            - generic [ref=e328]:
              - heading "Parent_U_1776858046958_2934" [level=5] [ref=e329]
              - paragraph
              - generic [ref=e330]:
                - generic [ref=e331]: 9 Permissions
                - generic [ref=e332]: "Reports To: Owner"
            - generic [ref=e333]:
              - heading "Key Modules:" [level=6] [ref=e334]
              - generic [ref=e335]:
                - generic [ref=e336]: Screens
                - generic [ref=e337]: Screens Actions
              - generic [ref=e338]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e339]:
                  - generic [ref=e340]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e341]: "Created: 4/22/2026"
            - generic [ref=e343]:
              - button " View" [ref=e344] [cursor=pointer]:
                - generic [ref=e345]: 
                - text: View
              - button " Edit" [ref=e346] [cursor=pointer]:
                - generic [ref=e347]: 
                - text: Edit
              - button " Delete" [ref=e348] [cursor=pointer]:
                - generic [ref=e349]: 
                - text: Delete
          - generic [ref=e352]:
            - generic [ref=e353]:
              - heading "R_NoParent_1776858028566_1931" [level=5] [ref=e354]
              - paragraph
              - generic [ref=e355]:
                - generic [ref=e356]: 56 Permissions
                - generic [ref=e357]: Restricted
                - generic [ref=e358]: "Reports To: Owner"
            - generic [ref=e359]:
              - heading "Key Modules:" [level=6] [ref=e360]
              - generic [ref=e361]:
                - generic [ref=e362]: Dashboard Stats
                - generic [ref=e363]: Media (Img/Vid)
                - generic [ref=e364]: Widgets
                - generic [ref=e365]: Media Sets
                - generic [ref=e366]: +11 more
              - generic [ref=e367]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e368]:
                  - generic [ref=e369]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e370]: "Created: 4/22/2026"
            - generic [ref=e372]:
              - button " View" [ref=e373] [cursor=pointer]:
                - generic [ref=e374]: 
                - text: View
              - button " Edit" [ref=e375] [cursor=pointer]:
                - generic [ref=e376]: 
                - text: Edit
              - button " Delete" [ref=e377] [cursor=pointer]:
                - generic [ref=e378]: 
                - text: Delete
          - generic [ref=e381]:
            - generic [ref=e382]:
              - heading "City Head 2" [level=5] [ref=e383]
              - paragraph
              - generic [ref=e384]:
                - generic [ref=e385]: 52 Permissions
                - generic [ref=e386]: Restricted
                - generic [ref=e387]: "Reports To: State Head 2"
            - generic [ref=e388]:
              - heading "Key Modules:" [level=6] [ref=e389]
              - generic [ref=e390]:
                - generic [ref=e391]: Dashboard Stats
                - generic [ref=e392]: Media (Img/Vid)
                - generic [ref=e393]: Widgets
                - generic [ref=e394]: Media Sets
                - generic [ref=e395]: +8 more
              - generic [ref=e396]:
                - heading " Assigned Subusers (6):" [level=6] [ref=e397]:
                  - generic [ref=e398]: 
                  - text: "Assigned Subusers (6):"
                - generic [ref=e399]:
                  - generic "mumbai (mumbai@wilyer.com)" [ref=e400]: mumbai
                  - generic "Nagpur (nagpur@wilyer.com)" [ref=e401]: Nagpur
                  - generic "Pune (pune@wilyer.com)" [ref=e402]: Pune
                  - generic "Tijara (tijara@wilyer.com) Jaipur (jaipur@wilyer.com) Alwar (alwar@wilyer.com)" [ref=e403]: +3 more
            - generic [ref=e404]: "Created: 4/22/2026"
            - generic [ref=e406]:
              - button " View" [ref=e407] [cursor=pointer]:
                - generic [ref=e408]: 
                - text: View
              - button " Edit" [ref=e409] [cursor=pointer]:
                - generic [ref=e410]: 
                - text: Edit
              - button " Delete" [ref=e411] [cursor=pointer]:
                - generic [ref=e412]: 
                - text: Delete
        - navigation "Page navigation" [ref=e413]:
          - list [ref=e414]:
            - listitem [ref=e415]:
              - button "Previous"
            - listitem [ref=e416]:
              - button "1" [ref=e417] [cursor=pointer]
            - listitem [ref=e418]:
              - button "2" [ref=e419] [cursor=pointer]
            - listitem [ref=e420]:
              - button "3" [ref=e421] [cursor=pointer]
            - listitem [ref=e422]:
              - button "4" [ref=e423] [cursor=pointer]
            - listitem [ref=e424]:
              - button "Next" [ref=e425] [cursor=pointer]
      - text:                                                  
  - text: "* *"
  - generic [ref=e427]:
    - alert [ref=e428]:
      - img [ref=e430]
      - generic [ref=e432]: Role deleted successfully
    - button "close" [ref=e433] [cursor=pointer]:
      - img [ref=e434]
    - progressbar "notification timer" [ref=e438]
```

# Test source

```ts
  119 |     const expanded = await this.parentTrigger.getAttribute('aria-expanded');
  120 |     if (expanded === 'true') await this.parentTrigger.click();
  121 |   }
  122 | 
  123 |   async selectParent(parentName: string): Promise<void> {
  124 |     await this.openParentDropdown();
  125 |     // Search narrows the list and makes clicks reliable even with long lists.
  126 |     await this.parentSearch.fill(parentName);
  127 |     const option = this.parentOptions.filter({ hasText: new RegExp(`^${this.escapeRegex(parentName)}$`, 'i') }).first();
  128 |     await option.click();
  129 |     // After selection the dropdown closes and the trigger shows the selected name.
  130 |     await expect(this.parentTrigger).toContainText(new RegExp(this.escapeRegex(parentName), 'i'));
  131 |   }
  132 | 
  133 |   /** Returns true iff the given parent name exists in the dropdown list (after filtering). */
  134 |   async parentOptionExists(parentName: string): Promise<boolean> {
  135 |     await this.openParentDropdown();
  136 |     await this.parentSearch.fill(parentName);
  137 |     const count = await this.parentOptions
  138 |       .filter({ hasText: new RegExp(`^${this.escapeRegex(parentName)}$`, 'i') })
  139 |       .count();
  140 |     await this.closeParentDropdown();
  141 |     return count > 0;
  142 |   }
  143 | 
  144 |   /**
  145 |    * Click the "Select All in <section>" label for each section given.
  146 |    * Unknown sections are skipped silently (keeps tests robust to label drift).
  147 |    */
  148 |   async selectPermissionSections(sections: readonly string[] = []): Promise<void> {
  149 |     const targets = sections.length ? sections : PERMISSION_SECTIONS;
  150 |     for (const section of targets) {
  151 |       const checkbox = this.dialog
  152 |         .locator('label')
  153 |         .filter({ hasText: new RegExp(`^\\s*Select All in ${this.escapeRegex(section)}\\s*$`, 'i') });
  154 |       if (await checkbox.isVisible().catch(() => false)) await checkbox.click();
  155 |     }
  156 |   }
  157 | 
  158 |   async submit(): Promise<void> {
  159 |     await this.submitBtn.click();
  160 |   }
  161 | 
  162 |   /** End-to-end happy-path create. */
  163 |   async createRole(payload: RolePayload): Promise<void> {
  164 |     await this.openCreateDialog();
  165 |     await this.roleNameInput.fill(payload.name);
  166 |     await this.setType(payload.type);
  167 |     if (payload.type === 'restricted') {
  168 |       if (!payload.parent) throw new Error('restricted roles require a parent');
  169 |       await this.selectParent(payload.parent);
  170 |     }
  171 |     await this.selectPermissionSections(payload.permissions ?? []);
  172 |     await this.submit();
  173 |     // On success the modal auto-dismisses.
  174 |     await expect(this.dialog).not.toHaveClass(/show/, { timeout: 15_000 });
  175 |   }
  176 | 
  177 |   /** Open + fill, but don't submit. For negative tests. */
  178 |   async fillCreateForm(payload: RolePayload): Promise<void> {
  179 |     await this.openCreateDialog();
  180 |     await this.roleNameInput.fill(payload.name);
  181 |     await this.setType(payload.type);
  182 |     if (payload.type === 'restricted' && payload.parent) {
  183 |       await this.selectParent(payload.parent);
  184 |     }
  185 |     await this.selectPermissionSections(payload.permissions ?? []);
  186 |   }
  187 | 
  188 |   async editRole(name: string): Promise<void> {
  189 |     const row = this.rowFor(name);
  190 |     await row.getByRole('button', { name: /edit/i }).click();
  191 |     await expect(this.dialog).toHaveClass(/show/);
  192 |   }
  193 | 
  194 |   async deleteRole(name: string): Promise<void> {
  195 |     const row = this.rowFor(name);
  196 |     await row.getByRole('button', { name: /delete/i }).click();
  197 |     await expect(this.deleteModal).toBeVisible();
  198 |     await this.deleteModal.getByRole('button', { name: /delete/i }).click();
  199 |     await expect(this.deleteModal).toBeHidden();
  200 |   }
  201 | 
  202 |   // ─── Assertions ────────────────────────────────────────────────────────────
  203 | 
  204 |   /**
  205 |    * The create form has no inline error UI. Failure = the modal stays open
  206 |    * after submit. We race a short timer against the success-signal (modal
  207 |    * losing class `show`); if the modal is still open at the end, rejection
  208 |    * is confirmed. A short polling delay is required because there's no
  209 |    * conditional event for "server did nothing".
  210 |    */
  211 |   async expectSubmitRejected(toastText?: string | RegExp): Promise<void> {
  212 |     // Wait for either the modal to close (success) or for 2s to elapse
  213 |     // (server silently rejected or is processing). This is a legitimate
  214 |     // "assert state has NOT changed" case — no conditional wait can replace it.
  215 |     const closed = await this.dialog
  216 |       .waitFor({ state: 'hidden', timeout: 2_500 })
  217 |       .then(() => true)
  218 |       .catch(() => false);
> 219 |     expect(closed, 'expected submit to be rejected (dialog should stay open)').toBeFalsy();
      |                                                                                ^ Error: expected submit to be rejected (dialog should stay open)
  220 |     await expect(this.dialog).toHaveClass(/show/);
  221 |     if (toastText) {
  222 |       const toast = this.page.getByRole('alert').filter({ hasText: toastText }).first();
  223 |       await expect(toast).toBeVisible({ timeout: 3_000 }).catch(() => {
  224 |         // Toast is optional — the primary signal is that the modal stayed open.
  225 |       });
  226 |     }
  227 |   }
  228 | 
  229 |   async expectRoleRow(name: string): Promise<void> {
  230 |     await expect(this.rowFor(name)).toBeVisible();
  231 |   }
  232 | 
  233 |   async expectRoleMissing(name: string): Promise<void> {
  234 |     await expect(this.rowFor(name)).toHaveCount(0);
  235 |   }
  236 | 
  237 |   async expectParentOptionAbsent(name: string): Promise<void> {
  238 |     const exists = await this.parentOptionExists(name);
  239 |     expect(exists, `expected "${name}" not to be offered as a parent`).toBeFalsy();
  240 |   }
  241 | 
  242 |   // ─── Helpers ───────────────────────────────────────────────────────────────
  243 | 
  244 |   /**
  245 |    * Locate a role's card by exact-match heading. Roles render as a grid of
  246 |    * `.card` tiles, each with `h5.card-title` holding the role name.
  247 |    */
  248 |   rowFor(name: string): Locator {
  249 |     return this.page
  250 |       .locator('.card')
  251 |       .filter({ has: this.page.locator('h5.card-title', { hasText: name }) })
  252 |       .first();
  253 |   }
  254 | 
  255 |   private escapeRegex(s: string): string {
  256 |     return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  257 |   }
  258 | }
  259 | 
```