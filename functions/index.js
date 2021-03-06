/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const deGuildABI =
  require("./contracts/DeGuild/V2/IDeGuild+.sol/IDeGuildPlus.json").abi;
const cmABI =
  require("./contracts/SkillCertificates/V2/ISkillCertificate+.sol/ISkillCertificatePlus.json").abi;
const ownableABI = require("./contracts/Ownable.json").abi;

const express = require("express");
const cors = require("cors")({ origin: true });
const guild = express();
const Web3Token = require("web3-token");
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");

/**
 * @dev function to check the token attached from the request, rejecting any request with no Web3 token attached
 */
const validateWeb3Token = async (req, res, next) => {

  if (!req.headers.authorization) {
    functions.logger.error(
      "No web token was passed in the Authorization header."
    );
    res.status(403).send("Unauthorized");
    return;
  }

  const token = req.headers.authorization;

  try {
    const { address, body } = await Web3Token.verify(token);

    if (address) {
      next();
      return;
    }
  } catch (error) {
    functions.logger.error("Error while verifying Firebase ID token:", error);
  }
  res.status(403).send("Unauthorized");
  return;
};


/**
 * @dev function to update submission file, but can only proceed if the sender is the client or taker
 */
const updateSubmission = async (req, res) => {
  const web3 = createAlchemyWeb3(functions.config().web3.api);
  const token = req.headers.authorization;
  const { address, body } = await Web3Token.verify(token);

  const tokenId = req.body.tokenId;
  const addressContract = req.body.address;
  const submission = req.body.submission;
  const note = req.body.note;

  // Send back a message that we've successfully written the message
  const deguild = new web3.eth.Contract(deGuildABI, addressContract);
  try {
    const caller = await deguild.methods.ownersOf(tokenId).call();
    if (
      caller[1] === web3.utils.toChecksumAddress(address) ||
      caller[0] === web3.utils.toChecksumAddress(address)
    ) {
      await admin
        .firestore()
        .collection(`DeGuild/${addressContract}/tokens`)
        .doc(tokenId)
        .update({
          submission,
          note,
        });
      res.json({
        result: address,
        name: caller,
        message: "Updated",
      });
    } else {
      res.status(403).json({
        message: "Unauthorize",
      });
    }
  } catch (error) {
    functions.logger.error("Error while verifying with web3", error);
    res.status(500).json({
      message: "ERROR",
    });
  }
};

/**
 * @dev function to add a job
 */
const addJob = async (req, res) => {
  // Grab the text parameter.
  const tokenId = req.body.tokenId;
  const level = req.body.level;
  const description = req.body.description;
  const title = req.body.title;
  const name = req.body.name;
  const time = req.body.time;
  const address = req.body.address;
  const submission = "";
  const note = "";
  // Push the new message into Firestore using the Firebase Admin SDK.

  await admin
    .firestore()
    .collection(`DeGuild/${address}/tokens`)
    .doc(tokenId)
    .set({
      title,
      level,
      tokenId: parseInt(tokenId, 10),
      description,
      name,
      submission,
      note,
      time,
    });

  // Send back a message that we've successfully written the message
  res.json({
    result: "Successful",
  });
};

/**
 * @dev function to set up a user profile
 */
const setProfile = async (req, res) => {
  // Grab the text parameter.
  const web3 = createAlchemyWeb3(functions.config().web3.api);
  const token = req.headers.authorization;
  const { address, body } = await Web3Token.verify(token);
  const userAddress = web3.utils.toChecksumAddress(address);
  const name = req.body.name;
  const url = req.body.url;
  // Grab the text parameter.
  const addressDeGuild = req.body.address;

  const readResult = await admin.firestore().collection(`Certificate`).get();
  const deguild = new web3.eth.Contract(deGuildABI, addressDeGuild);

  // Send back a message that we've successfully written the message3

  //All skills are fetched here
  const allSkills = await Promise.all(
    readResult.docs.map(async (doc) => {
      let data = [];
      const snapshot = await admin
        .firestore()
        .collection(`Certificate/${doc.id}/tokens`)
        .orderBy("tokenId", "asc")
        .get();
      snapshot.forEach((doc) => {
        data.push(doc.data());
      });
      return data.sort();
    })
  );

  //Use verify to check verification
  const verfiersResult = await Promise.all(
    allSkills.map(async (arr) => {
      const verifiers = await Promise.all(
        arr.map(async (token) => {
          try {
            const cm = new web3.eth.Contract(
              cmABI,
              web3.utils.toChecksumAddress(token.address)
            );
            const caller = await cm.methods
              .verify(userAddress, token.tokenId)
              .call();
            return caller;
          } catch (err) {
            return false;
          }
        })
      );

      const passed = verifiers.filter((ele) => ele);
      return passed.length;
    })
  );

  functions.logger.log(verfiersResult);
  functions.logger.log(verfiersResult.reduce((a, b) => a + b, 0));
  const completedJobs = await deguild.getPastEvents("JobCompleted", {
    filter: { taker: userAddress },
    fromBlock: 0,
    toBlock: "latest",
  });
  const level =
    verfiersResult.reduce((a, b) => a + b, 0) + completedJobs.length / 2.0;
  await admin.firestore().collection(`User`).doc(userAddress).set({
    url,
    name,
    level,
  });

  res.json({ url, name, level });
};

/**
 * @dev function to get submission file, but can only proceed if the sender is the client or taker
 */
const getSubmission = async (req, res) => {
  const bucket = admin.storage().bucket("deguild-2021.appspot.com");

  const web3 = createAlchemyWeb3(functions.config().web3.api);
  const token = req.headers.authorization;
  const addressDeGuild = req.params.address;
  const tokenId = req.params.jobId;
  const readResult = await admin
    .firestore()
    .collection(`DeGuild/${addressDeGuild}/tokens`)
    .doc(tokenId)
    .get();
  if (readResult.data()) {
    try {
      const { address, body } = await Web3Token.verify(token);
      const deguild = new web3.eth.Contract(deGuildABI, addressDeGuild);
      const caller = await deguild.methods.ownersOf(tokenId).call();

      const userAddress = web3.utils.toChecksumAddress(address);

      // `zipfile/${userAddress.value.user}/${this.job.title}-submission`
      if (caller[0] === userAddress) {
        functions.logger.info("NICE! Good to go!");
        functions.logger.info(readResult.data().submission);

        const file = await bucket.file(readResult.data().submission);

        functions.logger.info(file);

        const urlOptions = {
          version: "v4",
          action: "read",
          expires: Date.now() + 1000 * 60 * 2, // 2 minutes
        };

        const sign = await file.getSignedUrl(urlOptions);

        functions.logger.info(sign);

        res.json({
          result: sign,
        });
      }
    } catch (error) {
      functions.logger.error(sign);

      res.json(error);
    }
  } else {
    res.status(404).json({
      message: "Job not found!",
    });
  }
  // Send back a message that we've successfully written the message
};

/**
 * @dev function to get submission file, but can only proceed if the sender is the owner of deGuild
 */
const adminInvestigate = async (req, res) => {
  const bucket = admin.storage().bucket("deguild-2021.appspot.com");
  const addressDeGuild = req.params.address;

  const web3 = createAlchemyWeb3(functions.config().web3.api);
  const token = req.headers.authorization;
  const addressTaker = req.body.addressTaker;
  const title = req.body.title;
  try {
    const { address, body } = await Web3Token.verify(token);

    const userAddress = web3.utils.toChecksumAddress(address);

    const ownable = new web3.eth.Contract(ownableABI, addressDeGuild);
    const ownerOfShop = await ownable.methods.owner().call();
    if (ownerOfShop === userAddress) {
      functions.logger.info("NICE! Good to go!");

      const file = bucket.file(`zipfile/${addressTaker}/${title}-submission`);
      file
        .exists()
        .then(async (exists) => {
          if (exists[0]) {
            const urlOptions = {
              version: "v4",
              action: "read",
              expires: Date.now() + 1000 * 60 * 2, // 2 minutes
            };

            const sign = await file.getSignedUrl(urlOptions);

            functions.logger.info(sign);

            res.json({
              result: sign,
            });
          } else {
            res.status(404).json({ message: "no file" });
          }
          return;
        })
        .catch((err) => {
          res.status(500).json(err);
        });

      functions.logger.info(file);

    } else {
      res.status(403).json({
        message: "You are not the guildmaster!",
      });
    }
  } catch (error) {
    res.status(500).json(error);
  }
  // Send back a message that we've successfully written the message
};


/**
 * @dev function to delete a job from database
 */
const deleteJob = async (req, res) => {
  // Grab the text parameter.
  const address = req.body.address;
  const id = req.body.jobId;

  await admin.firestore().collection(`DeGuild/${address}/tokens`).doc(id).delete();
  // Send back a message that we've successfully written the message
  res.json({
    result: "Successful",
    removed: address,
  });
};

guild.use(cors);
guild.use(validateWeb3Token);

guild.post("/addJob", addJob);
guild.post("/deleteJob", deleteJob);
guild.post("/register", setProfile);
guild.put("/profile", setProfile);
guild.put("/submit", updateSubmission);
guild.get("/submission/:address/:jobId", getSubmission);
guild.post("/submission/:address", adminInvestigate);

exports.guild = functions.https.onRequest(guild);
