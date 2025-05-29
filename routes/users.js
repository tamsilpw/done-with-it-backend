const express = require("express");
const router = express.Router();
const { User, validate } = require("../models/user");
const _ = require("lodash");
const bcrypt = require("bcrypt");
const auth = require("../middleware/auth");
const { Image } = require("../models/image");

router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -expoPushToken");
  res.send(user);
});

router.post("/", async (req, res) => {
  const { error } = validate(req.body);
  if (error)
    return res
      .status(400)
      .send({ success: false, message: error.details[0].message });

  let user = await User.findOne({ email: req.body.email });
  if (user)
    return res
      .status(400)
      .send({ success: false, message: "User already exists" });

  user = new User(_.pick(req.body, ["name", "email", "password"]));
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(user.password, salt);
  await user.save();

  const token = user.generateAuthToken();
  res
    .header("x-auth-token", token)
    .send(_.pick(user, ["_id", "name", "email"]));
});

router.post("/expoPushTokens", auth, async (req, res) => {
  if (!req.body.token)
    return res
      .status(400)
      .send({ status: false, message: "No push token found" });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { expoPushToken: req.body.token },
    { new: true }
  ).select("-password");

  res.send({ success: true, data: user });
});

router.put("/update-image", auth, async (req, res) => {
  if (!req.body.imageId)
    return res
      .status(400)
      .send({ status: false, message: "no ImageId provided" });

  const image = await Image.findById(req.body.imageId);
  if (!image)
    res.status(404).send({ status: false, message: "image not found" });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { imageId: image },
    { new: true }
  ).select("-password -expoPushToken");

  return res.send({ success: true, data: user });
});

module.exports = router;
