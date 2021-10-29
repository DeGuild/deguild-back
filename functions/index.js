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
const express = require("express");
const cors = require("cors")({ origin: true });
const guild = express();
const Web3Token = require("web3-token");

const validateWeb3Token = async (req, res, next) => {
  if (!req.headers.authorization) {
    functions.logger.error(
      "No web token was passed in the Authorization header."
    );
    res.status(403).send("Unauthorized");
    return;
  }

  const token = req.headers['Authorization']

  try {
    const { address, body } = await Web3Token.verify(token);
    if (
      address === "0x9cb8E9aF151e570c54046dC50F72Bd76B12715e7" ||
      req.originalUrl === "/test" ||
      req.originalUrl === "/profile"
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

const addJob = async (req, res) => {
  // Grab the text parameter.
  const tokenId = req.body.tokenId;
  const courseId = req.body.courseId;
  const description = req.body.description;
  const name = req.body.name;
  const url = req.body.url
    ? req.body.url
    : "https://firebasestorage.googleapis.com/v0/b/deguild-2021.appspot.com/o/0.png?alt=media&token=131e4102-2ca3-4bf0-9480-3038c45aa372";

  const prerequisite = req.body.prerequisite
    ? req.body.prerequisite
    : "0x0000000000000000000000000000000000000000";
  // Push the new message into Firestore using the Firebase Admin SDK.

  await admin
    .firestore()
    .collection(`DeGuild/${address}/tokens`)
    .doc(tokenId)
    .set({
      url,
      tokenId: parseInt(tokenId, 10),
      courseId,
      description,
      name,
      prerequisite,
    });

  // Send back a message that we've successfully written the message
  res.json({
    result: "Successful",
  });
};

const setProfile = async (req, res) => {
  // Grab the text parameter.
  const name = req.body.name;
  const url = req.body.url
    ? req.body.url
    : "https://firebasestorage.googleapis.com/v0/b/deguild-2021.appspot.com/o/0.png?alt=media&token=131e4102-2ca3-4bf0-9480-3038c45aa372";

  const prerequisite = req.body.prerequisite
    ? req.body.prerequisite
    : "0x0000000000000000000000000000000000000000";
  // Push the new message into Firestore using the Firebase Admin SDK.

  await admin
    .firestore()
    .collection(`DeGuild/${address}`)
    .doc(tokenId)
    .set({
      url,
      name,
    });

  // Send back a message that we've successfully written the message
  res.json({
    result: "Successful",
  });
};

const testAPI = async (req, res) => {
  const token = req.headers['Authorization']
  try {
    const { address, body } = await Web3Token.verify(token);
    res.json({
      result: address,
    });
  } catch (error) {
    functions.logger.error("Error while verifying Firebase ID token:", error);
    res.json({
      result: "What is this token, sir?",
    });
  }
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
guild.get("/test", testAPI);
guild.get("/profile", setProfile);

exports.guild = functions.https.onRequest(guild);
