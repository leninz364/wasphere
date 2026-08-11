export const MESSAGE_TYPES = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "gif",
  "location",
  "contact",
  "buttons",
  "list",
  "poll",
  "reaction",
  "view-once",
] as const

export type MessageType = (typeof MESSAGE_TYPES)[number]

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  text: "Texto",
  image: "Imagen",
  video: "Video",
  audio: "Audio",
  document: "Documento",
  sticker: "Sticker",
  gif: "GIF",
  location: "Ubicación",
  contact: "Contacto",
  buttons: "Botones",
  list: "Lista",
  poll: "Encuesta",
  reaction: "Reacción",
  "view-once": "Ver una vez",
}

export const TYPE_ROW_1: MessageType[] = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "gif",
]

export const TYPE_ROW_2: MessageType[] = [
  "location",
  "contact",
  "buttons",
  "list",
  "poll",
  "reaction",
  "view-once",
]
