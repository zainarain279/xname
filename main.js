const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, saveToken, isTokenExpired, saveJson, updateEnv, getRandomNumber } = require("./utils");
const { checkBaseUrl } = require("./checkAPI");
const headers = require("./core/header");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

class ClientAPI {
  constructor(accountIndex, initData, session_name, baseURL, token) {
    this.accountIndex = accountIndex;
    this.queryId = initData;
    this.headers = headers;
    this.session_name = session_name;
    this.session_user_agents = this.#load_session_data();
    this.baseURL = baseURL;
    this.token = token;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Create user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(
    url,
    method,
    data = {},
    options = {
      retries: 1,
      isAuth: false,
    }
  ) {
    const { retries, isAuth } = options;

    const headers = {
      ...this.headers,
    };

    if (!isAuth) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url: `${url}`,
          data,
          headers,
          timeout: 30000,
        });

        // let response = await fetch(url, {
        //   method,
        //   body: JSON.stringify(data),
        //   headers: headers,
        //   timeout: 15000,
        // });
        // response = await response.json();
        success = true;
        if (response.data) return { success: true, data: response.data.data };
        return { success: false, data: response.data };
      } catch (error) {
        if (error.status == 400) {
          this.log(`Invalid request for ${url}, maybe have new update from server | contact: https://t.me/AirdropScript6 to get new update!`, "error");
          process.exit(0);
        }
        this.log(`Yêu cầu thất bại: ${url} | ${error.message} | đang thử lại...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
      currRetries++;
    } while (currRetries <= retries && !success);
  }

  async auth() {
    return this.makeRequest(`${this.baseURL}/api/login`, "post", { datacheckstring: this.queryId }, { isAuth: true });
  }

  async checkRestoresStatus() {
    return this.makeRequest(`${this.baseURL}/fire/checkRestoresStatus`, "post");
  }
  async startFlight() {
    return this.makeRequest(`${this.baseURL}/game/flightWithTime`, "post");
  }
  async stopFlight() {
    return this.makeRequest(`${this.baseURL}/game/stopFlight`, "post");
  }

  async checkFightStatus() {
    return this.makeRequest(`${this.baseURL}/game/checkFightStatus`, "post");
  }

  async startGame() {
    return this.makeRequest(`https://fire.xname.app/fire/takeOff`, "post");
  }

  async stopGame(payload) {
    // number: 4689;
    return this.makeRequest(`https://fire.xname.app/fire/landing`, "post", payload);
  }

  async bindCode() {
    return this.makeRequest(`${this.baseURL}/user/bindnInvitationCode`, "post", { code: "58A11" });
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/user/showUser`, "post");
  }

  async getTasks() {
    return this.makeRequest(`${this.baseURL}/task/showTaskV2`, "post");
  }

  async completeTask(payload) {
    return this.makeRequest(`${this.baseURL}/task/taskActivity`, "post", payload);
  }

  async claimTask(payload) {
    return this.makeRequest(`${this.baseURL}/user/sucess-quest`, "post", payload);
  }

  async checkin() {
    return this.makeRequest(`${this.baseURL}/task/checkInDay`, "post");
  }

  async checkinStatus() {
    return this.makeRequest(`${this.baseURL}/task/showTodayCheckIn`, "post");
  }

  async equipPet(payload) {
    return this.makeRequest(`${this.baseURL}/user/loadingPets`, "post", payload);
  }

  async getPets() {
    return this.makeRequest(`${this.baseURL}/user/showPets`, "post");
  }

  async getStorePets() {
    return this.makeRequest(`${this.baseURL}/market/showPet`, "post");
  }

  async buyPet(payload) {
    return this.makeRequest(`${this.baseURL}/market/buy`, "post", payload);
  }

  async sellPet(payload) {
    return this.makeRequest(`${this.baseURL}/market/sell`, "post", payload);
  }

  async upSpeed() {
    return this.makeRequest(`${this.baseURL}/user/upgradeLevel`, "post");
  }

  async handleUpSpeed() {
    const { data } = await this.getUserInfo();
    if (!data) return;
    let { lv: level, xcoin } = data;
    while (true) {
      if (level >= settings.MAX_LEVEL_SPEED) return;
      await sleep(1);
      const cost = 60000 * Math.pow(1.1, level);
      if (xcoin <= cost) {
        return this.log(`No enough coin to up speed`, "warning");
      }

      this.log(`Upgrading speed: level ${level} to level ${level + 1}...`);
      const res = await this.upSpeed();
      if (res.success) {
        this.log(`Upgrading speed up to level ${level + 1} successfully`, "success");
        level++;
        xcoin -= cost;
      }
    }
  }

  async handleBuyPet() {
    const storePets = await this.getStorePets();
    const { data } = await this.getUserInfo();

    if (storePets.success) {
      const pet = storePets.data.reverse().find((pet) => pet.property.buy <= data.xcoin);
      if (pet) {
        this.log(`Buying pet: ${pet.property.name} (${pet.petnumber})`, "success");
        await this.buyPet({ petnumber: pet.petnumber, number: 1 });
      } else {
        this.log("No pet found in store to buy.", "warning");
      }
    }
  }

  async handleCheckEquipPet() {
    const pets = await this.getPets();
    const { data } = await this.getUserInfo();
    const petNumber = data.petnumber || 0;
    if (petNumber > 0) return;
    if (pets.success) {
      const equippedPet = pets.data.reverse().find((pet) => pet.number > 0);
      if (equippedPet) {
        await this.equipPet({ petnumber: equippedPet.petnumber });
        this.log(`Equipped pet: ${equippedPet.property.name} (${equippedPet.petnumber})`, "success");

        if (settings.AUTO_SELL_PET) {
          const petsAvaliableSell = pets.data.filter((pet) => pet.petnumber != equippedPet.petnumber);
          if (petsAvaliableSell.length > 0) {
            for (const petAvaliableSell of petsAvaliableSell) {
              await sleep(2);
              const resSell = await this.sellPet({ petnumber: petAvaliableSell.petnumber, number: petAvaliableSell.number });
              if (resSell.success) {
                this.log(`Selling pet: ${petAvaliableSell.property.name} (${petAvaliableSell.petnumber}) | Reward: ${petAvaliableSell.property.sell * petAvaliableSell.number}`, "success");
              } else {
                this.log(`Failed to sell pet: ${petAvaliableSell.property.name} (${petAvaliableSell.petnumber})`, "warning");
              }
            }
          }
        }
      } else {
        if (settings.AUTO_BUY_PET) {
          this.log("No equipped pet found, starting buy per...", "warning");
          await sleep(1);
          await this.handleBuyPet();
        } else {
          this.log("No equipped pet found, and auto buy pet is disabled.", "warning");
        }
      }
    }
  }

  async handleGame() {
    const restores = await this.checkRestoresStatus();
    if (restores.success) {
      let { draws } = restores.data;
      let curr = 1;
      while (draws > 0) {
        await sleep(3);
        this.log(`Starting game ${curr}...`);
        const startInfo = await this.startGame();
        if (startInfo.success && startInfo?.data?.result == "OK") {
          await sleep(6);
          const number = getRandomNumber(4500, 4600);
          const stopInfo = await this.stopGame({
            number,
          });
          if (stopInfo.success) {
            const { xcoin, info } = stopInfo.data;
            if (!stopInfo?.data?.status) {
              this.log(`Game ${curr} stopped failed - SpaceX broken | No reward: ${xcoin}`, "warning");
            } else if (info?.name) {
              this.log(`Game ${curr} stopped successfully! | Reward: ${xcoin} | Got new pet ${info.name}`, "success");
            } else {
              this.log(`Game ${curr} stopped successfully! | Reward: ${xcoin}`, "success");
            }
          }
        }
        curr++;
        draws--;
      }
    }
  }

  async handleMining() {
    const fightStatus = await this.checkFightStatus();
    if (fightStatus.success) {
      const { stopTime, claimXcoin, lv } = fightStatus.data;

      this.log(`Flighting | Level: ${lv} | xCoin mined: ${claimXcoin}...`);
      if (Math.floor(Date.now() / 1000) > stopTime || !stopTime) {
        const stopResult = await this.stopFlight();
        if (stopResult.success) {
          this.log(`Flight stopped successfully! | Reward: ${claimXcoin}`, "success");
        } else {
        }
        this.log("Start flighting...", "warning");
        await this.startFlight();
      } else {
        this.log("Flight running!", "warning");
      }
    } else {
      this.log("Can't get info fight status!", "error");
    }
  }
  async handleCheckIn() {
    const checkinStatus = await this.checkinStatus();
    if (checkinStatus.success) {
      const { isQualifications } = checkinStatus.data;
      if (isQualifications) {
        const checkinResult = await this.checkin();
        if (checkinResult.success) {
          this.log("Checkin success fully!", "success");
        } else {
          this.log("Checkin failed!", "warning");
        }
      } else {
        this.log("You checked in today, comback tommorow!", "warning");
      }
    } else {
      this.log("Can't get info checkin!", "error");
    }
  }

  async getValidToken() {
    const userId = this.session_name;
    const existingToken = this.token;
    let loginResult = null;

    const isExp = isTokenExpired(existingToken);
    if (existingToken && !isExp) {
      this.log("Using valid token", "success");
      return existingToken;
    } else {
      this.log("Token not found or expired, logging in...", "warning");
      loginResult = await this.auth();
    }

    if (loginResult?.success) {
      const { jwt } = loginResult?.data;
      const token = jwt?.split("Bearer ")[1];
      if (token) {
        saveToken(userId, token);
        this.token = token;
      }

      return token;
    } else {
      this.log(`Can't get token, try get new query_id!`, "warning");
    }
    return null;
  }

  async handleTasks() {
    const quests = await this.getTasks();
    if (quests.success) {
      let tasks = Object.values(quests.data).flat();
      tasks = tasks.filter((t) => !t.isReceive && t.isQualifications && !settings.SKIP_TASKS.includes(t.key));
      if (tasks.length > 0) {
        for (const task of tasks) {
          await sleep(2);
          let res = { success: false, data: null };
          this.log(`Completing task ${task.from} | ${task.key} | ${task.property.title}...`);
          res = await this.completeTask({ activityAction: task.key });
          if (res.success) {
            this.log(`Task ${task.key} | ${task.property.title} completed successfully!`, "success");
          }
        }
      } else {
        return this.log(`No tasks available!`, "warning");
      }
    }
  }
  async processAccount() {
    const token = await this.getValidToken();
    if (!token) return this.log(`Can't get token for account ${this.accountIndex + 1}, skipping...`, "error");

    let userData = { success: false, data: null },
      retries = 0;
    do {
      userData = await this.getUserInfo();
      if (userData?.success) break;
      retries++;
    } while (retries < 2);

    if (userData.success) {
      const userInfo = userData.data;
      const { xcoin, bind, xhs, mlmmultiples, TrueXhs, lv, kms, petnumber, xid } = userInfo;
      this.log(`Xcoin: ${xcoin} | XHS: ${xhs} | Speed level: ${lv}(${kms} km/s) | Pet number ID: ${petnumber} | Verify human xid: ${xid}`, "custom");
      if (!bind) {
        await this.bindCode();
      }
      await sleep(1);
      await this.handleCheckIn();

      if (settings.AUTO_TASK) {
        await sleep(1);
        await this.handleTasks();
      }
      await sleep(1);
      await this.handleMining();
      if (!petnumber) {
        await sleep(1);
        await this.handleCheckEquipPet();
      }

      await sleep(1);
      await this.handleUpSpeed();
      await sleep(1);
      await this.handleGame();
      const { data: newData } = await this.getUserInfo();
      this.log(
        `Xcoin: ${newData?.xcoin} | XHS: ${newData?.xhs} | Speed level: ${newData?.lv}(${newData?.kms} km/s) | Pet number ID: ${newData?.petnumber} | Verify human xid: ${newData?.xid}`,
        "custom"
      );
    } else {
      return this.log("Can't get use info...skipping", "error");
    }
  }
}

async function main() {
  console.log(colors.yellow("https://t.me/AirdropScript6"));

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`API ID not found, try again later!`.red);
  console.log(`${message}`.yellow);

  const data = loadData("data.txt");
  const tokens = require("./token.json");

  const maxThreads = settings.MAX_THEADS_NO_PROXY;
  while (true) {
    for (let i = 0; i < data.length; i += maxThreads) {
      const batch = data.slice(i, i + maxThreads);

      const promises = batch.map(async (initData, indexInBatch) => {
        const accountIndex = i + indexInBatch;
        const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
        const firstName = userData.first_name || "";
        const lastName = userData.last_name || "";
        const session_name = userData.id;

        console.log(`=========Account ${accountIndex + 1}| ${firstName + " " + lastName}`.green);
        const client = new ClientAPI(accountIndex, initData, session_name, hasIDAPI, tokens[session_name]);
        client.set_headers();

        return timeout(client.processAccount(), 24 * 60 * 60 * 1000).catch((err) => {
          client.log(`Account processing error: ${err.message}`, "error");
        });
      });
      await Promise.allSettled(promises);
    }
    await sleep(5);
    console.log(`Complete all accounts | Waiting ${settings.TIME_SLEEP} minute=============`.magenta);
    await sleep(settings.TIME_SLEEP * 60);
  }
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
