# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rbac\role-permissions.spec.ts >> RBAC — permission constraints >> child cannot receive permissions the parent lacks (escalation blocked)
- Location: tests\rbac\role-permissions.spec.ts:21:7

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
              - heading "PermParent_1776858527002_2572" [level=5] [ref=e96]
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
              - heading "DelChild_1776858488363_604" [level=5] [ref=e121]
              - paragraph
              - generic [ref=e122]:
                - generic [ref=e123]: 9 Permissions
                - generic [ref=e124]: Restricted
                - generic [ref=e125]: "Reports To: DelParent_1776858488363_3400"
            - generic [ref=e126]:
              - heading "Key Modules:" [level=6] [ref=e127]
              - generic [ref=e128]:
                - generic [ref=e129]: Screens
                - generic [ref=e130]: Screens Actions
              - generic [ref=e131]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e132]:
                  - generic [ref=e133]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e134]: "Created: 4/22/2026"
            - generic [ref=e136]:
              - button " View" [ref=e137] [cursor=pointer]:
                - generic [ref=e138]: 
                - text: View
              - button " Edit" [ref=e139] [cursor=pointer]:
                - generic [ref=e140]: 
                - text: Edit
              - button " Delete" [ref=e141] [cursor=pointer]:
                - generic [ref=e142]: 
                - text: Delete
          - generic [ref=e145]:
            - generic [ref=e146]:
              - heading "DelParent_1776858488363_3400" [level=5] [ref=e147]
              - paragraph
              - generic [ref=e148]:
                - generic [ref=e149]: 9 Permissions
                - generic [ref=e150]: "Reports To: Owner"
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
              - heading "Cyc_A_1776858393356_7680" [level=5] [ref=e172]
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
              - heading "Parent_U_1776858373871_6673" [level=5] [ref=e197]
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
              - heading "R_NoParent_1776858358743_6220" [level=5] [ref=e222]
              - paragraph
              - generic [ref=e223]:
                - generic [ref=e224]: 56 Permissions
                - generic [ref=e225]: Restricted
                - generic [ref=e226]: "Reports To: Owner"
            - generic [ref=e227]:
              - heading "Key Modules:" [level=6] [ref=e228]
              - generic [ref=e229]:
                - generic [ref=e230]: Dashboard Stats
                - generic [ref=e231]: Media (Img/Vid)
                - generic [ref=e232]: Widgets
                - generic [ref=e233]: Media Sets
                - generic [ref=e234]: +11 more
              - generic [ref=e235]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e236]:
                  - generic [ref=e237]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e238]: "Created: 4/22/2026"
            - generic [ref=e240]:
              - button " View" [ref=e241] [cursor=pointer]:
                - generic [ref=e242]: 
                - text: View
              - button " Edit" [ref=e243] [cursor=pointer]:
                - generic [ref=e244]: 
                - text: Edit
              - button " Delete" [ref=e245] [cursor=pointer]:
                - generic [ref=e246]: 
                - text: Delete
          - generic [ref=e249]:
            - generic [ref=e250]:
              - heading "Self_1776858153151_5606" [level=5] [ref=e251]
              - paragraph
              - generic [ref=e252]:
                - generic [ref=e253]: 56 Permissions
                - generic [ref=e254]: "Reports To: Owner"
            - generic [ref=e255]:
              - heading "Key Modules:" [level=6] [ref=e256]
              - generic [ref=e257]:
                - generic [ref=e258]: Dashboard Stats
                - generic [ref=e259]: Media (Img/Vid)
                - generic [ref=e260]: Widgets
                - generic [ref=e261]: Media Sets
                - generic [ref=e262]: +11 more
              - generic [ref=e263]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e264]:
                  - generic [ref=e265]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e266]: "Created: 4/22/2026"
            - generic [ref=e268]:
              - button " View" [ref=e269] [cursor=pointer]:
                - generic [ref=e270]: 
                - text: View
              - button " Edit" [ref=e271] [cursor=pointer]:
                - generic [ref=e272]: 
                - text: Edit
              - button " Delete" [ref=e273] [cursor=pointer]:
                - generic [ref=e274]: 
                - text: Delete
          - generic [ref=e277]:
            - generic [ref=e278]:
              - heading "Cyc_A_1776858100815_8931" [level=5] [ref=e279]
              - paragraph
              - generic [ref=e280]:
                - generic [ref=e281]: 9 Permissions
                - generic [ref=e282]: "Reports To: Owner"
            - generic [ref=e283]:
              - heading "Key Modules:" [level=6] [ref=e284]
              - generic [ref=e285]:
                - generic [ref=e286]: Screens
                - generic [ref=e287]: Screens Actions
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
              - heading "Parent_U_1776858046958_2934" [level=5] [ref=e304]
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
              - heading "R_NoParent_1776858028566_1931" [level=5] [ref=e329]
              - paragraph
              - generic [ref=e330]:
                - generic [ref=e331]: 56 Permissions
                - generic [ref=e332]: Restricted
                - generic [ref=e333]: "Reports To: Owner"
            - generic [ref=e334]:
              - heading "Key Modules:" [level=6] [ref=e335]
              - generic [ref=e336]:
                - generic [ref=e337]: Dashboard Stats
                - generic [ref=e338]: Media (Img/Vid)
                - generic [ref=e339]: Widgets
                - generic [ref=e340]: Media Sets
                - generic [ref=e341]: +11 more
              - generic [ref=e342]:
                - heading " Assigned Subusers (0):" [level=6] [ref=e343]:
                  - generic [ref=e344]: 
                  - text: "Assigned Subusers (0):"
                - text: No subusers assigned
            - generic [ref=e345]: "Created: 4/22/2026"
            - generic [ref=e347]:
              - button " View" [ref=e348] [cursor=pointer]:
                - generic [ref=e349]: 
                - text: View
              - button " Edit" [ref=e350] [cursor=pointer]:
                - generic [ref=e351]: 
                - text: Edit
              - button " Delete" [ref=e352] [cursor=pointer]:
                - generic [ref=e353]: 
                - text: Delete
          - generic [ref=e356]:
            - generic [ref=e357]:
              - heading "City Head 2" [level=5] [ref=e358]
              - paragraph
              - generic [ref=e359]:
                - generic [ref=e360]: 52 Permissions
                - generic [ref=e361]: Restricted
                - generic [ref=e362]: "Reports To: State Head 2"
            - generic [ref=e363]:
              - heading "Key Modules:" [level=6] [ref=e364]
              - generic [ref=e365]:
                - generic [ref=e366]: Dashboard Stats
                - generic [ref=e367]: Media (Img/Vid)
                - generic [ref=e368]: Widgets
                - generic [ref=e369]: Media Sets
                - generic [ref=e370]: +8 more
              - generic [ref=e371]:
                - heading " Assigned Subusers (6):" [level=6] [ref=e372]:
                  - generic [ref=e373]: 
                  - text: "Assigned Subusers (6):"
                - generic [ref=e374]:
                  - generic "mumbai (mumbai@wilyer.com)" [ref=e375]: mumbai
                  - generic "Nagpur (nagpur@wilyer.com)" [ref=e376]: Nagpur
                  - generic "Pune (pune@wilyer.com)" [ref=e377]: Pune
                  - generic "Tijara (tijara@wilyer.com) Jaipur (jaipur@wilyer.com) Alwar (alwar@wilyer.com)" [ref=e378]: +3 more
            - generic [ref=e379]: "Created: 4/22/2026"
            - generic [ref=e381]:
              - button " View" [ref=e382] [cursor=pointer]:
                - generic [ref=e383]: 
                - text: View
              - button " Edit" [ref=e384] [cursor=pointer]:
                - generic [ref=e385]: 
                - text: Edit
              - button " Delete" [ref=e386] [cursor=pointer]:
                - generic [ref=e387]: 
                - text: Delete
          - generic [ref=e390]:
            - generic [ref=e391]:
              - heading "State Head 2" [level=5] [ref=e392]
              - paragraph
              - generic [ref=e393]:
                - generic [ref=e394]: 52 Permissions
                - generic [ref=e395]: Restricted
                - generic [ref=e396]: "Reports To: Owner"
            - generic [ref=e397]:
              - heading "Key Modules:" [level=6] [ref=e398]
              - generic [ref=e399]:
                - generic [ref=e400]: Dashboard Stats
                - generic [ref=e401]: Media (Img/Vid)
                - generic [ref=e402]: Widgets
                - generic [ref=e403]: Media Sets
                - generic [ref=e404]: +8 more
              - generic [ref=e405]:
                - heading " Assigned Subusers (2):" [level=6] [ref=e406]:
                  - generic [ref=e407]: 
                  - text: "Assigned Subusers (2):"
                - generic [ref=e408]:
                  - generic "Maharastra (maharastra@wilyer.com)" [ref=e409]: Maharastra
                  - generic "Rajasthan (rajasthan@wilyer.com)" [ref=e410]: Rajasthan
            - generic [ref=e411]: "Created: 4/22/2026"
            - generic [ref=e413]:
              - button " View" [ref=e414] [cursor=pointer]:
                - generic [ref=e415]: 
                - text: View
              - button " Edit" [ref=e416] [cursor=pointer]:
                - generic [ref=e417]: 
                - text: Edit
              - button " Delete" [ref=e418] [cursor=pointer]:
                - generic [ref=e419]: 
                - text: Delete
        - navigation "Page navigation" [ref=e420]:
          - list [ref=e421]:
            - listitem [ref=e422]:
              - button "Previous"
            - listitem [ref=e423]:
              - button "1" [ref=e424] [cursor=pointer]
            - listitem [ref=e425]:
              - button "2" [ref=e426] [cursor=pointer]
            - listitem [ref=e427]:
              - button "3" [ref=e428] [cursor=pointer]
            - listitem [ref=e429]:
              - button "4" [ref=e430] [cursor=pointer]
            - listitem [ref=e431]:
              - button "Next" [ref=e432] [cursor=pointer]
      - text:                                                  
  - text: "* *"
  - generic [ref=e433]:
    - generic [ref=e434]:
      - generic [ref=e435]:
        - img [ref=e437]
        - generic [ref=e439]: Role created successfully
      - button "close" [ref=e440] [cursor=pointer]:
        - img [ref=e441]
      - generic [ref=e443]:
        - progressbar "notification timer"
    - generic [ref=e445]:
      - alert [ref=e446]:
        - img [ref=e448]
        - generic [ref=e450]: Role deleted successfully
      - button "close" [ref=e451] [cursor=pointer]:
        - img [ref=e452]
      - progressbar "notification timer" [ref=e456]
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