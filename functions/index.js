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

const { abi } = require("./IDeGuildPlus.json");

const express = require("express");
const cors = require("cors")({ origin: true });
const guild = express();
const Web3Token = require("web3-token");
const { createAlchemyWeb3 } = require("@alch/alchemy-web3");

const validateWeb3Token = async (req, res, next) => {
  const web3 = createAlchemyWeb3(functions.config().web3.api);

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

    if (
      address
    ) {
      next();
      return;
    }
  } catch (error) {
    functions.logger.error("Error while verifying Firebase ID token:", error);
  }
  res.status(403).send("Unauthorized");
  return;
};

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions
async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

const updateSubmission = async (req, res) => {
  const web3 = createAlchemyWeb3(functions.config().web3.api);
  const token = req.headers.authorization;
  const { address, body } = await Web3Token.verify(token);

  const tokenId = req.body.tokenId;
  const addressContract = req.body.address;
  const submission = req.body.submission;
  const note = req.body.note;

  // Send back a message that we've successfully written the message
  const deguild = new web3.eth.Contract(abi, addressContract);
  try {
    const caller = await deguild.methods.ownersOf(tokenId).call();
    if (caller[1] === web3.utils.toChecksumAddress(address) || caller[0] === web3.utils.toChecksumAddress(address)) {
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

const setProfile = async (req, res) => {
  // Grab the text parameter.
  const token = req.headers.authorization;
  const { address, body } = await Web3Token.verify(token);
  const name = req.body.name;
  const url = req.body.url
    ? req.body.url
    : "https://firebasestorage.googleapis.com/v0/b/deguild-2021.appspot.com/o/0.png?alt=media";

  await admin.firestore().collection(`User`).doc(address).set({
    url,
    name,
  });

  // Send back a message that we've successfully written the message
  res.json({
    result: "Successful",
  });
};

const getSubmission = async (req, res) => {
  const bucket = admin.storage().bucket('deguild-2021.appspot.com');

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
      const deguild = new web3.eth.Contract(abi, addressDeGuild);
      const caller = await deguild.methods.ownersOf(tokenId).call();

      if (caller[0] === web3.utils.toChecksumAddress(address)) {
        functions.logger.info("NICE! Good to go!");
        functions.logger.info(readResult.data().submission);

        const file = await bucket
        .file(readResult.data().submission);

        functions.logger.info(file);

        const urlOptions = {
          version: 'v4',
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

const testAPI = async (req, res) => {
  const token = req.headers.authorization;
  const { address, body } = await Web3Token.verify(token);
  functions.logger.info(token);
  functions.logger.info(address);
  res.json({
    result: address,
    key: token,
  });
  // Send back a message that we've successfully written the message
};

const deleteJob = async (req, res) => {
  // Grab the text parameter.
  const address = req.body.address;
  const id = req.body.jobId;

  await admin.firestore().collection(`DeGuild`).doc(id).delete();
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
guild.post("/profile", setProfile);
guild.put("/submit", updateSubmission);
// guild.get("/test", testAPI);
guild.get("/submission/:address/:jobId", getSubmission);

exports.guild = functions.https.onRequest(guild);
