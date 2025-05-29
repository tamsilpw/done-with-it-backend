const mongoose = require("mongoose");
const Joi = require("joi");

const categorySchema = mongoose.Schema({
  label: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 50,
  },
  icon: {
    type: String,
  },
  backgroundColor: {
    type: String,
  },
});

const Category = mongoose.model("Category", categorySchemas);

function validateCategory(genre) {
  const schema = Joi.object({
    label: Joi.string().min(3).required(),
    icon: Joi.string(),
    backgroundColor: Joi.string(),
  });

  return schema.validate(genre);
}

module.exports = { Category, validateCategory, categorySchema };
