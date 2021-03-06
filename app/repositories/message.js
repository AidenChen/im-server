const Kamora = require('kamora')
const error = require('../../config/error')
const conversationRepository = require('./conversation')

const redis = Kamora.redis
const User = Kamora.Database.model('user')

exports.sendMessage = async (io, payloads) => {
  const cid = payloads[0].cid

  const conversation = await conversationRepository.findBy({ cid })
  if (!conversation) {
    return
  }

  const members = await User
    .find({ username: { $in: conversation.members } })
    .catch(() => {
      throw new Kamora.Error(error.name.INTERNAL_SERVER_ERROR)
    })

  // 如果是新的聊天，给members的聊天列表中都添加一条记录
  if (conversation.is_new) {
    const membersWithoutCreator = conversation.members.filter((member) => {
      return member !== conversation.creator
    })
    await User
      .update({ username: { $in: membersWithoutCreator } }, { $addToSet: { conversations: conversation.id } })
      .catch(() => {
        throw new Kamora.Error(error.name.INTERNAL_SERVER_ERROR)
      })
    conversation.is_new = false
    conversation.save()
  }

  payloads = payloads.map((payload) => {
    payload.timestamp = Date.now()
    return payload
  })

  members.forEach((member) => {
    if (member.is_online && member.socket_id) {
      io
        .to(member.socket_id)
        .emit('message', payloads)
    } else {
      const serialPayloads = payloads.map((payload) => {
        return JSON.stringify(payload)
      })
      redis.rpush(`message:${member.id}`, ...serialPayloads)
    }
  })
}

exports.sendOfflineMessage = async (socket, userId) => {
  let redisKey = `message:${userId}`
  let queue = await redis.lrange(redisKey, 0, -1)
  if (!queue.length) {
    return
  }

  let payloads = queue.map((item) => {
    return JSON.parse(item)
  })

  let payloadsDict = new Map()
  for (let i = 0; i < payloads.length; i++) {
    let payload = payloads[i]
    let conversationId = payload.conversation_id

    if (payloadsDict.get(conversationId)) {
      payloadsDict.get(conversationId).push(payload)
    } else {
      payloadsDict.set(conversationId, [payload])
    }
  }

  for (let value of payloadsDict.values()) {
    socket
      .emit('message', value)
  }

  await redis.del(redisKey)
}
