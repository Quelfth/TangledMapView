﻿
using System.Collections;
using Modding;
using Modding.Patches;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace TangledMapView {

public class TangledMapViewMod : Mod {
	public static TangledMapViewMod Instance { get; private set; }

	internal MapServer server;
	// public SaveGameData activeSaveData;
	private bool saveLoaded, startingSave;
	private RandomizerMod.RandomizerMod rndMod;
	public string CurrentRoom { get; private set; }

	public TangledMapViewMod() : base("TangledMapView") { }

	public override int LoadPriority() {
		return 100;//want randomizer to load before us
	}

	public override void Initialize() {
		base.Initialize();
		Instance = this;

		//Make an object to help us do things:
		var go = new GameObject("TangledMapManager", typeof(TangledMapManager));
		var tmm = go.GetComponent<TangledMapManager>();
		tmm.mod = this;
		Object.DontDestroyOnLoad(go);

		rndMod = RandomizerMod.RandomizerMod.Instance;


		On.GameManager.BeginSceneTransition += OnBeginSceneTransition;
		UnityEngine.SceneManagement.SceneManager.sceneLoaded += OnSceneLoaded;
		ModHooks.Instance.AfterSavegameLoadHook += data => {
			// Log("get load");
			saveLoaded = true;
			server.Send(PrepareSaveDataMessage());
		};

		//not called, likely because the randomizer mod overrides how a game is started
		//ModHooks.Instance.NewGameHook += ...

		On.UIManager.StartNewGame += (orig, self, death, rush) => {
			// Log("got StartNewGame");
			startingSave = true;//we will actually push data once a scene loads
			orig(self, death, rush);
		};
	}

	private void OnBeginSceneTransition(On.GameManager.orig_BeginSceneTransition orig, GameManager self, GameManager.SceneLoadInfo info) {
		// Log($"OnBeginSceneTransition: to {info.SceneName}[{info.EntryGateName}]");
		if (!string.IsNullOrEmpty(info.SceneName) && !string.IsNullOrEmpty(info.EntryGateName)) {
			server.Send("revealTransition", "to", $"{info.SceneName}[{info.EntryGateName}]");
		}

		orig(self, info);
	}

	private void OnSceneLoaded(Scene scene, LoadSceneMode mode) {
		CurrentRoom = scene.name;

		if (scene.name == "Menu_Title") {
			if (saveLoaded) {
				saveLoaded = false;
				startingSave = false;
				server.Send(PrepareSaveDataMessage());
			}
			return;
		}

		if (startingSave) {
			startingSave = false;
			saveLoaded = true;
			server.Send(PrepareSaveDataMessage());
		}

		server.Send(PreparePlayerMoveMessage());
	}

	public string PreparePlayerMoveMessage() {
		return JToken.FromObject(new {
			type = "playerMove",
			newRoom = CurrentRoom,
		}).ToString();
	}

	public string PrepareSaveDataMessage() {
		if (!saveLoaded) {
			return JToken.FromObject(new {
				type = "unloadSave",
			}).ToString();
		}

		return JsonConvert.SerializeObject(
			new {
				type = "loadSave",
				data = new {
					//this is more-or-less the normal save file data, but not everything
					playerData = GameManager.instance.playerData,
					PolymorphicModData = new {RandomizerMod = JsonConvert.SerializeObject(rndMod.Settings)},
				},
			},
			Formatting.None, new JsonSerializerSettings {
				ContractResolver = ShouldSerializeContractResolver.Instance,
				TypeNameHandling = TypeNameHandling.Auto,
				Converters = JsonConverterTypes.ConverterTypes,
			}
		);
	}



	public override string GetVersion() {
		return "0.0.1";
	}
}

internal class TangledMapManager : MonoBehaviour {
	public TangledMapViewMod mod;
	public void Start() => StartCoroutine(StartServer());
	public void OnApplicationQuit() => mod?.server.Stop();
	public void OnDisable() => mod?.server.Stop();

	private IEnumerator StartServer() {
		//game crashes if we start server right away
		yield return null;
		yield return null;
		yield return null;

		mod.server = new MapServer((Modding.ILogger)mod);
		mod.server.Start();
		mod.Log("TangledMapViewMod web server started: http://localhost:" + mod.server.port + "/");

	}
}

}
