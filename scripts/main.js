class BloodstoneAPI {
    // ⚠️ IMPORTANT: This must match the "id" in your module.json exactly!
    static MODULE_ID = "bloodstone-utility";

    /**
     * Core function to safely change a player's variables
     */
    static async modifyPlayerResource(userId, flagKey, amount, resourceName) {
        const user = game.users.get(userId);
        if (!user) return;

        // Get current value, default to 0
        const current = user.getFlag(this.MODULE_ID, flagKey) || 0;
        
        // Calculate new value (Math.max prevents negative values)
        const newValue = Math.max(0, current + amount);
        
        // Save to database
        await user.setFlag(this.MODULE_ID, flagKey, newValue);

        // Notify the GM
        const action = amount >= 0 ? "Added" : "Removed";
        const absAmount = Math.abs(amount);
        ui.notifications.info(`Bloodstone Utility | ${action} ${absAmount} ${resourceName} for ${user.name}. Total: ${newValue}.`);
    }

    /**
     * Generates and displays the GM Menu Dialog
     */
    static showMenu(flagKey, resourceName) {
        if (!game.user.isGM) {
            return ui.notifications.warn("Only the GM can manage these resources.");
        }

        // Build dropdown of players and their current values
        let userOptions = game.users.map(u => {
            let currentVal = u.getFlag(this.MODULE_ID, flagKey) || 0;
            return `<option value="${u.id}">${u.name} (Current: ${currentVal})</option>`;
        }).join("");

        let content = `
            <form>
                <div class="form-group">
                    <label>Select Player:</label>
                    <select id="bs-user-select">${userOptions}</select>
                </div>
                <div class="form-group">
                    <label>Amount:</label>
                    <input type="number" id="bs-amount" value="1" min="1">
                </div>
            </form>
        `;

        new Dialog({
            title: `Manage ${resourceName}`,
            content: content,
            buttons: {
                add: {
                    icon: "<i class='fas fa-plus'></i>",
                    label: "Add",
                    callback: (html) => {
                        let userId = html.find("#bs-user-select").val();
                        let amount = Number(html.find("#bs-amount").val());
                        this.modifyPlayerResource(userId, flagKey, amount, resourceName);
                    }
                },
                remove: {
                    icon: "<i class='fas fa-minus'></i>",
                    label: "Remove",
                    callback: (html) => {
                        let userId = html.find("#bs-user-select").val();
                        let amount = Number(html.find("#bs-amount").val());
                        this.modifyPlayerResource(userId, flagKey, -amount, resourceName); 
                    }
                }
            },
            default: "add"
        }).render(true);
    }
}

// Attach the API to your module when Foundry initializes.
// If you already have a Hooks.once("init") in your file, just put the game.modules line inside it!
Hooks.once("init", () => {
    game.modules.get(BloodstoneAPI.MODULE_ID).api = BloodstoneAPI;
    console.log("Bloodstone Utility | API Registered successfully.");
});