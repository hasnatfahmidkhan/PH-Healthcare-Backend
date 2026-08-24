import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const idTokenKey = "bkash:idToken";
    const refreshTokenKey = "bkash:refreshToken";

    let bkashIdToken = await redisClient.get(idTokenKey);
    const bkashIdTokenTTL = await redisClient.ttl(idTokenKey);
    let bkashRefreshToken = await redisClient.get(refreshTokenKey);
    const bkashRefreshTokenTTL = await redisClient.ttl(refreshTokenKey);

    // bkash id token remaining time lest than equals 10 minutes or bkash id token expire
    // bkash refresh token must exists
    // bkash refresh token remaining time less than 10 minutes
    if (
      (bkashIdTokenTTL <= 600 || !bkashIdToken) &&
      bkashRefreshToken &&
      bkashRefreshTokenTTL > 600
    ) {
      const refreshTokenResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken,
          }),
        },
      );

      const refreshTokenResult = await refreshTokenResponse.json();

      if (!refreshTokenResult.statusCode) {
        throw new Error("Bkash refresh token grant faild");
      }

      bkashIdToken = refreshTokenResult.id_token as string;

      await redisClient.set(idTokenKey, bkashIdToken, {
        expiration: {
          type: "EX",
          value: 60 * 60,
        },
      });

      return bkashIdToken;
    }

    if (bkashIdTokenTTL > 600) {
      return bkashIdToken;
    }

    const idTokenResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    const idTokenResult = await idTokenResponse.json();

    if (!idTokenResult.statusCode) {
      throw new Error("Bkash access token grant faild");
    }

    bkashIdToken = idTokenResult.id_token;
    bkashRefreshToken = idTokenResult.refresh_token;

    // set id token to redis
    await redisClient.set(idTokenKey, bkashIdToken as string, {
      expiration: {
        type: "EX",
        value: 60 * 60,
      },
    });

    // set refresh token to redis
    await redisClient.set(refreshTokenKey, bkashRefreshToken as string, {
      expiration: {
        type: "EX",
        value: 60 * 60 * 24 * 28,
      },
    });

    return bkashIdToken;
  } catch (error: any) {
    throw new Error(error.message);
  }
};
