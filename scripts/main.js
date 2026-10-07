class BloodstoneAPI {
    static MODULE_ID = "bloodstone-utility";

    /**
     * Core function to change variables and instantly update the UI string
     */
    static async modifyPlayerResource(userId, flagKey, amount, resourceName, html) {
        const user = game.users.get(userId);
        if (!user) return;

        const current = user.getFlag(this.MODULE_ID, flagKey) || 0;
        const newValue = Math.max(0, current + amount); // Prevent going below 0
        
        await user.setFlag(this.MODULE_ID, flagKey, newValue);

        // Update the number directly on the screen without closing the menu
        if (html) {
            html.find(`.resource-count[data-user="${userId}"]`).text(newValue);
        }

        // Optional: comment out the line below if you find the chat notifications too spammy when clicking fast!
        ui.notifications.info(`Bloodstone Utility | ${user.name} now has ${newValue} ${resourceName}.`);
    }

    /**
     * Generates and displays the persistent GM Menu Dialog
     */
    static showMenu(flagKey, resourceName) {
        if (!game.user.isGM) {
            return ui.notifications.warn("Only the GM can manage these resources.");
        }

        // 1. FILTER: Only get Players (Role 1) and Trusted Players (Role 2)
        const validUsers = game.users.filter(u => 
            u.role === CONST.USER_ROLES.PLAYER || 
            u.role === CONST.USER_ROLES.TRUSTED
        );

        if (validUsers.length === 0) {
            return ui.notifications.warn("No Players or Trusted Players found in the game.");
        }

        // 2. BUILD UI: Create a row for every valid player with + and - buttons
        let userRows = validUsers.map(u => {
            let currentVal = u.getFlag(this.MODULE_ID, flagKey) || 0;
            return `
                <div class="form-group flexrow" style="align-items: center; margin-bottom: 8px;">
                    <label style="flex: 2;">${u.name}</label>
                    <div style="flex: 1; text-align: center;">
                        <span class="resource-count" data-user="${u.id}" style="font-weight: bold; font-size: 1.2em;">${currentVal}</span>
                    </div>
                    <div style="flex: 1; display: flex; gap: 5px;">
                        <button class="adj-btn" data-user="${u.id}" data-amt="-1">-</button>
                        <button class="adj-btn" data-user="${u.id}" data-amt="1">+</button>
                    </div>
                </div>
            `;
        }).join("");

        let content = `<div style="margin-bottom: 10px;">${userRows}</div>`;

        // 3. RENDER: The Dialog window
        new Dialog({
            title: `Manage ${resourceName}`,
            content: content,
            buttons: {
                close: {
                    icon: "<i class='fas fa-times'></i>",
                    label: "Close Window"
                }
            },
            // The render hook fires immediately after the HTML is injected into the screen
            render: (html) => {
                // Attach a click listener to all buttons with the "adj-btn" class
                html.find(".adj-btn").click(async (ev) => {
                    ev.preventDefault();
                    // Grab the user ID and the amount (+1 or -1) from the HTML data tags
                    const userId = ev.currentTarget.dataset.user;
                    const amount = Number(ev.currentTarget.dataset.amt);
                    
                    // Call our function, passing the html so it can update the text live
                    await this.modifyPlayerResource(userId, flagKey, amount, resourceName, html);
                });
            }
        }, { width: 400 }).render(true);
    }
}

/**
 * The Questboard UI Application
 */
class BloodstoneQuestboard extends Application {
    constructor(options) {
        super(options);
        this.activeQuestId = null; // Remembers which quest is clicked
    }

    // Tells Foundry how to draw the window
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "bloodstone-questboard",
            title: "Bloodstone Questboard",
            template: "modules/bloodstone-utility/templates/questboard.html",
            width: 750,
            height: 600,
            resizable: true,
            classes: ["bloodstone-window"] // Adds a CSS class in case you want to style it later
        });
    }

    // Prepares the data to be sent to the HTML template
    getData() {
        // Find the specific Journal
        let journal = game.journal.getName("Bloodstone Quests");
        
        // Check permissions (Role 3 = Assistant GM, Role 4 = GM)
        let canEdit = game.user.role >= CONST.USER_ROLES.ASSISTANT;

        if (!journal) return { noJournal: true, canEdit };

        let categories = { "Available": [], "Started": [], "Finished": [] };
        let activeQuestData = null;

        // Loop through all pages in the journal and sort them
        for (let page of journal.pages) {
            let status = page.getFlag("bloodstone-utility", "status") || "Available";
            let isActive = (this.activeQuestId === page.id);
            
            let qData = { id: page.id, name: page.name, isActive };

            if (categories[status]) categories[status].push(qData);
            else categories["Available"].push(qData); // Fallback

            // If this is the quest the user clicked, prep its full text
            if (isActive) {
                activeQuestData = {
                    id: page.id,
                    name: page.name,
                    content: page.text.content,
                    isAvailable: status === "Available",
                    isStarted: status === "Started",
                    isFinished: status === "Finished"
                };
            }
        }

        return { categories, activeQuest: activeQuestData, canEdit, noJournal: false };
    }

    // Listens for clicks in the HTML
    activateListeners(html) {
        super.activateListeners(html);

        // Click a quest in the left pane
        html.find('.quest-link').click(ev => {
            this.activeQuestId = ev.currentTarget.dataset.id;
            this.render(); // Redraw the UI
        });

        // ONLY GMs: Change quest status dropdown
        html.find('.quest-status').change(async ev => {
            let pageId = ev.currentTarget.dataset.id;
            let newStatus = ev.currentTarget.value;
            let page = game.journal.getName("Bloodstone Quests").pages.get(pageId);
            
            await page.setFlag("bloodstone-utility", "status", newStatus);
            this.render();
        });

        // ONLY GMs: Create a new quest
        html.find('.quest-create').click(async ev => {
            let journal = game.journal.getName("Bloodstone Quests");
            await journal.createEmbeddedDocuments("JournalEntryPage", [{
                name: "New Quest",
                type: "text",
                "flags.bloodstone-utility.status": "Available"
            }]);
            this.render();
        });

        // ONLY GMs: Edit quest text (Opens native Foundry editor!)
        html.find('.quest-edit').click(ev => {
            let pageId = ev.currentTarget.dataset.id;
            let page = game.journal.getName("Bloodstone Quests").pages.get(pageId);
            page.sheet.render(true); 
        });

        // ONLY GMs: Delete a quest
        html.find('.quest-delete').click(async ev => {
            let pageId = ev.currentTarget.dataset.id;
            let page = game.journal.getName("Bloodstone Quests").pages.get(pageId);
            
            Dialog.confirm({
                title: "Delete Quest?",
                content: `<p>Are you sure you want to delete <b>${page.name}</b>?</p>`,
                yes: async () => {
                    await page.delete();
                    this.activeQuestId = null;
                    this.render();
                }
            });
        });
    }
}

// Register the API
Hooks.once("init", () => {
    // 1. Register your existing API
    game.modules.get(BloodstoneAPI.MODULE_ID).api = BloodstoneAPI;
    console.log("Bloodstone Utility | API Registered successfully.");

    // 2. Register the Keybind
    game.keybindings.register("bloodstone-utility", "openQuestboard", {
        name: "Open Questboard",
        hint: "Opens the Bloodstone Questboard menu for all players.",
        editable: [
            { key: "KeyB", modifiers: ["Control"] } // Default: Ctrl + B
        ],
        onDown: () => {
            // Check if the window is already open. If not, open it.
            let existing = Object.values(ui.windows).find(w => w.id === "bloodstone-questboard");
            if (existing) {
                existing.bringToTop();
            } else {
                new BloodstoneQuestboard().render(true);
            }
        },
        restricted: false, // False means players can use it too, not just GMs
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });
});

// Bonus: Automatically refresh the Questboard if a GM edits a Journal Page!
Hooks.on("updateJournalEntryPage", (page) => {
    if (page.parent.name === "Bloodstone Quests") {
        let openBoard = Object.values(ui.windows).find(w => w.id === "bloodstone-questboard");
        if (openBoard) openBoard.render();
    }
});