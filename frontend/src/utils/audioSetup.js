import { register } from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';

let isEncoderRegistered = false;

export const registerWavEncoder = async () => {
  if (!isEncoderRegistered) {
    try {
      await register(await connect());
      isEncoderRegistered = true;
      console.log("WAV Encoder registered successfully");
    } catch (error) {
      console.error("Failed to register WAV encoder:", error);
    }
  }
};