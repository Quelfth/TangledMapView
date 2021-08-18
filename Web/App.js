
class App {
	ws = null
	prefs = {
		spoilers: false,
		followPlayer: true,
		layout: "islands",
	}

	constructor() {
		this.data = window.data = new DataGen()

		this.cluster = new ClusterHandler(this.data)
		this.dataRender = new DataRender(this.cluster)
	}

	_setBlockingMessage(msg) {
		var el = d3.select("#blockingMessage")
		if (msg) {
			el.style("display", "").text(msg)
		} else {
			el.style("display", "none").text("")
		}
	}

	async start() {
		this._setBlockingMessage("Loading...")

		this._setupPrefs()

		var svg = this.svg = d3.select("svg")

		var zoom = this.zoom = d3.zoom()
			.scaleExtent([.1, 2.5])
			.filter(ev => {
				if (ev.ctrlKey && ev.type === "wheel") return false
				if (!ev.type.startsWith("mouse")) return true
				return ev.button === 0 || ev.button === 2
			})
			.on("zoom", ev => updateZoom(ev.transform))

		function updateZoom(transform) {
			nodeHolder.attr("transform", transform)
		}
		function updateSize() {
			var w2 = svg.node().clientWidth / 2
			var h2 = svg.node().clientHeight / 2
			svg.attr("viewBox", [-w2, -h2, w2 * 2, h2 * 2])
			zoom.extent([[-w2, -h2], [w2, h2]])
		}

		window.addEventListener("resize", updateSize)

		svg
			.call(zoom)
			.on("dblclick.zoom", null)
			.on("contextmenu", ev => ev.preventDefault())//don't show menu, we permit right drag to pan

		const nodeHolder = svg.append("g").attr("id", "mainMap")

		this.dataRender.renderInto(nodeHolder)

		updateSize()

		this._ready = true

		if (location.protocol === "file:") {
			await this.loadTestData()
			this._render()
		} else {
			this.wsConnect()
			setInterval(this.wsConnect.bind(this), 10 * 1000)
		}
	}

	_setupPrefs() {
		for (let k in this.prefs) {
			let defaultValue = this.prefs[k]
			let v = localStorage.getItem("pref-" + k)
			if (v === null) v = defaultValue
			else v = JSON.parse(v)

			this.updatePref(k, v)
		}
	}

	updatePref(k, v) {
		let el = document.getElementById("pref-" + k)
		if (el.tagName === "BUTTON") {
			d3.select(el).classed("enabled", v)
		} else if (el.tagName === "SELECT") {
			el.value = v
		}

		switch (k) {
			case "spoilers": this.data.showAll = v; break
			case "layout": this.cluster.layout = v; break
		}
		this.prefs[k] = v
		localStorage.setItem("pref-" + k, JSON.stringify(v))

		if (!this._ready) return

		switch (k) {
			case "layout": this.cluster.fullRebuild(); break
		}
		this.dataRender.update()
	}

	_render() {
		this.zoom.scaleTo(this.svg, .3)
		this.zoom.translateTo(this.svg, 0, 0)

		this.dataRender.update()

		if (this.data.saveData) this._setBlockingMessage(null)
		else this._setBlockingMessage("No save loaded")
	}

	async loadTestData() {
		this.data.load(testSaveData)
	}

	unloadSave() {
		this.data.clear()
		this._render()
	}

	wsConnect() {
		if (this.ws || location.protocol === "file:") return

		this.ws = new WebSocket("ws://" + location.host + "/ws")
		this.ws.addEventListener("open", ev => {
			console.log("Connected to server")
			this._render()
		})
		this.ws.addEventListener("message", ev => {
			//console.log("Msg", ev.data)
			this.handleMessage(JSON.parse(ev.data))
		})
		this.ws.addEventListener("close", ev => {
			this.ws = null
			this.unloadSave()
			this._setBlockingMessage("No game running")
		})
		this.ws.addEventListener("error", ev => {
			this.ws = null
			this.unloadSave()
			this._setBlockingMessage("No game running")
		})
	}

	handleMessage(msg) {
		switch (msg.type) {
			case "playerMove":
				this.data.currentPlayerRoom = msg.newRoom
				d3.select(".currentRoom").classed("currentRoom", false)
				let el = d3.select("#room-" + msg.newRoom).classed("currentRoom", true)
				if (this.prefs.followPlayer && el.node()) {
					// let t0 = d3.zoomTransform(this.svg)
					// let t0 = this.svg.node().__zoom
					// let rect = el.node().getBoundingClientRect()
					// let parentRect = document.getElementById("mainMap").getBoundingClientRect()
					// let x = rect.left + rect.width / 2 - parentRect.left
					// let y = rect.top + rect.height / 2 - parentRect.top
					// x = x / t0.k
					// y = y / t0.k
					// let t1 = new d3.ZoomTransform(t0.k, rect.left + rect.width / 2, rect.top + rect.height / 2)
					// this.svg.transition().duration(800).call(this.zoom.transform, t1)

					let room = el.data()[0]
					let x = room.x + (room.island?.x || 0)
					let y = room.y + (room.island?.y || 0)
					this.svg.transition().duration(800).call(this.zoom.translateTo, x, y)
				}
				this.dataRender.update()
				break
			case "loadSave":
				this.data.load(msg.data)
				this._render()
				break
			case "unloadSave":
				this.unloadSave()
				break
			case "revealTransition":
				this.data.addVisit(msg.from)
				this.data.addVisit(msg.to)
				this.dataRender.update()
				break
			default:
				console.warn("Unknown message: ", msg)
				break
		}
	}

	debugReveal(type) {
		var bestRoom, bestDistance = -Infinity
		for (let room of Object.values(this.data.visibleRooms)) {
			if (room.islandDistance > bestDistance && !room.isEveryTransitionVisited) {
				bestRoom = room
				bestDistance = room.islandDistance
			}
		}

		if (bestRoom) {
			var doors = bestRoom.unvisitedDoors
			var door = doors[Math.floor(Math.random() * doors.length)]
			console.log("debug reveal " + door)
			this.data.addVisit(door)
			this.dataRender.update()
		}
	}
}