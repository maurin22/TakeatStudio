chrome.commands.onCommand.addListener(async (command) => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	if (tab && tab.id != null) {
		chrome.tabs.sendMessage(tab.id, { command }).catch(() => {})
	}
})
