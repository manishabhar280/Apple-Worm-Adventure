export function registerModel(mongoose, name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}
