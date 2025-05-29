const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { Message, validateMessage, Conversation } = require("../models/message");
const validateId = require("../middleware/mongoId-validation");
const { Listing } = require("../models/listing");
const { User } = require("../models/user");
const {
  sendPushNotificationOfChat,
} = require("../utilities/createPushNotification");

const messageLimit = 20;

router.get("/", auth, async (req, res) => {
  const conversations = await Conversation.find({
    $or: [{ userId1: req.user._id }, { userId2: req.user._id }],
  }).sort("-updatedAt");
  res.send({ success: true, data: conversations });
});

router.get("/:id", [auth, validateId], async (req, res) => {
  const messages = await Message.find({ conversationId: req.params.id })
    .sort({ createdAt: -1 })
    .limit(messageLimit)
    .skip((req.query.page - 1) * messageLimit);

  res.send({ success: true, data: messages });
});

router.put("/message-seen/:id", [auth, validateId], async (req, res) => {
  const oldConvo = await Conversation.findById(req.params.id);
  if(!oldConvo) return res.status(404).send({ success: false, message: "Couldn't find conversation"})

  if (oldConvo.unreadBy.length === 0) return res.status(201).send({ success: true })

  const updatedUnread = oldConvo.unreadBy.filter((userId) => req.user._id !== userId)
  await Conversation.findByIdAndUpdate(req.params.id, {
    unreadBy: updatedUnread,
  });

  return res.status(201).send({ success: true })
})

router.get("/conversation/:id", [auth, validateId], async (req, res) => {
  const query = {
    $or: [
      { userId1: req.user._id, userId2: req.params.id },
      { userId1: req.params.id, userId2: req.user._id },
    ],
  };
  const conversation = await Conversation.find(query);

  if (conversation.length) res.send({ success: true, data: conversation[0] });
  else {
    const user = await User.findById(req.params.id).select(
      "-password -expoPushToken"
    );
    if (!user)
      return res.status(404).send({ success: true, message: "User not found" });

    const newConversation = new Conversation({
      userId1: req.user._id,
      userId2: req.params.id,
      user1Data: req.user,
      user2Data: user,
      updatedAt: Date.now(),
    });

    res.send({ success: true, data: newConversation });
  }
});

router.post("/", auth, async (req, res) => {
  if (req.body.conversationId) {
    const { error } = validateMessage(req.body);
    if (error) {
      return res
        .status(400)
        .send({ success: false, message: error.details[0].message });
    }

    const conversation = await Conversation.findById(req.body.conversationId);
    if (!conversation)
      return res
        .status(404)
        .send({ success: false, data: "No conversation found" });

    const message = new Message({
      conversationId: conversation._id,
      createdAt: Date.now(),
      message: req.body.message,
      createdBy: req.user,
      attachedMessage: req.body.attachedMessage
    });

    const targetUserId =
      conversation.userId1 === req.user._id
        ? conversation.userId2
        : conversation.userId1;
    const user = await User.findById(targetUserId).select("-password");

    targetUserId === conversation.userId1
      ? (conversation.user1Data = user)
      : (conversation.user2Data = user);
      
    conversation.unreadBy = [targetUserId];
    conversation.updatedAt = Date.now();
    conversation.recentMessage = message;
    await conversation.save();
    await message.save();

    sendPushNotificationOfChat(
      user.expoPushToken,
      req.user.name,
      req.body.message,
      // { data: conversation }
    );

    return res.status(200).send({ success: true, data: message });
  } else {
    if (!req.body.listingId)
      return res
        .status(400)
        .send({ success: false, message: "No listing Id found in payload" });

    const listing = await Listing.findById(req.body.listingId);
    if (!listing)
      return res
        .status(404)
        .send({ success: false, data: "listing not found!" });

    const user = await User.findById(listing.createdBy._id).select("-password");

    let query = {
      $or: [
        { userId1: req.user._id, userId2: listing.createdBy._id },
        { userId1: listing.createdBy._id, userId2: req.user._id },
      ],
    };

    const conversation = await Conversation.find(query);

    if (!conversation.length) {
      const newConversation = new Conversation({
        userId1: req.user._id,
        userId2: listing.createdBy._id,
        user1Data: req.user,
        user2Data: user,
        updatedAt: Date.now(),
        unreadBy: [listing.createdBy._id],
      });

      const message = new Message({
        conversationId: newConversation._id,
        createdAt: Date.now(),
        message: req.body.message,
        createdBy: req.user,
      });

      newConversation.recentMessage = message;
      await newConversation.save();
      await message.save();

      sendPushNotificationOfChat(
        user.expoPushToken,
        req.user.name,
        req.body.message,
        { data: newConversation }
      );

      return res.status(200).send({ success: true, data: message });
    } else {
      const message = new Message({
        conversationId: conversation[0]._id,
        createdAt: Date.now(),
        message: req.body.message,
        createdBy: req.user,
      });

      const existingConversation = await Conversation.findByIdAndUpdate(
        conversation[0]._id,
        {
          updatedAt: Date.now(),
          recentMessage: message,
          unreadBy: [listing.createdBy._id],
        },
        { new: true }
      );

      if (!conversation)
        return res
          .status(404)
          .send({ success: false, data: "No conversation found" });

      await message.save();

      sendPushNotificationOfChat(
        user.expoPushToken,
        req.user.name,
        req.body.message,
        { data: existingConversation }
      );
      return res.status(200).send({ success: true, data: message });
    }
  }
});

module.exports = router;
