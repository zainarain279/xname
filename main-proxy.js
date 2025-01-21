const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber, saveToken, isTokenExpired, saveJson, updateEnv } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { checkBaseUrl } = require("./checkAPI");
const headers = require("./core/header");

class ClientAPI {
  constructor(queryId, accountIndex, proxy, baseURL, tokens) {
    this.headers = headers;
    this.baseURL = baseURL;
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.tokens = tokens;
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

    console.log(`[Tài khoản ${this.accountIndex + 1}] Tạo user agent...`.blue);
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

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      const telegramauth = this.queryId;
      const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
      this.session_name = userData.id;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Can't create user agent, try get new query_id: ${error.message}`, "error");
      return;
    }
  }

  async log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
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

    const proxyAgent = new HttpsProxyAgent(this.proxy);
    let currRetries = 0,
      success = false;
    do {
      try {
        const response = await axios({
          method,
          url: `${url}`,
          data,
          headers,
          httpsAgent: proxyAgent,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data.data };
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

  async runAccount() {
    try {
      this.proxyIP = await this.checkProxyIP();
    } catch (error) {
      this.log(`Cannot check proxy IP: ${error.message}`, "warning");
      return;
    }

    const accountIndex = this.accountIndex;
    const initData = this.queryId;
    const queryData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
    const firstName = queryData.first_name || "";
    const lastName = queryData.last_name || "";
    this.session_name = queryData.id;

    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Tài khoản ${accountIndex + 1}| ${firstName + " " + lastName} | ${this.proxyIP} | Bắt đầu sau ${timesleep} giây...`.green);
    this.#set_headers();
    await sleep(timesleep);

    const token = await this.getValidToken();
    if (!token) return this.log(`Can't get token for account ${this.accountIndex + 1}, skipping...`, "error");
    this.token = token;
    let userData = { success: false },
      retries = 0;
    do {
      userData = await this.getUserInfo();
      if (userData?.success) break;
      retries++;
    } while (retries < 2);

    // process.exit(0);
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

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, hasIDAPI, tokens } = workerData;
  const to = new ClientAPI(queryId, accountIndex, proxy, hasIDAPI, tokens);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");
  const tokens = require("./token.json");

  if (queryIds.length > proxies.length) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  console.log("https://t.me/AirdropScript6".yellow);
  let maxThreads = settings.MAX_THEADS;

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
  console.log(`${message}`.yellow);
  // process.exit();
  queryIds.map((val, i) => new ClientAPI(val, i, proxies[i], hasIDAPI).createUserAgent());

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            hasIDAPI,
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
            tokens,
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              if (settings.ENABLE_DEBUG) {
                console.log(message);
              }
              resolve();
            });
            worker.on("error", (error) => {
              console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              worker.terminate();
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    await sleep(3);
    console.log("https://t.me/AirdropScript6)".yellow);
    console.log(`=============Hoàn thành tất cả tài khoản | Chờ ${settings.TIME_SLEEP} phút=============`.magenta);
    await sleep(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
