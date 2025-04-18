// 'use client';

// import { useEffect } from 'react';
// import { useRouter, useSearchParams } from 'next/navigation';
// import { notifications } from '@mantine/notifications';
// import { Center, Container, Loader } from '@mantine/core';
// import { Suspense } from 'react';
// import {BASE_URL} from "../../utils/DevMode";

// const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
// const clientSecret = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;

// // const redirectUri = process.env.NEXT_PUBLIC_MASTODON_OAUTH_REDIRECT_URI;

// const redirectUri = `${BASE_URL}/callback`;

// function CallbackPage() {
//   const router = useRouter();
//   const searchParams = useSearchParams();


//   useEffect(() => {
//     const fetchAccessToken = async (code: string, instance: string) => {
//       try {
//         const response = await fetch(`${instance}/oauth/token`, {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//           body: JSON.stringify({
//             client_id: clientId,
//             client_secret: clientSecret,
//             redirect_uri: redirectUri,
//             grant_type: 'authorization_code',
//             code,
//           }),
//         });

//         const data = await response.json();
//         if (response.ok) {
//           const accessToken = data.access_token;
//           localStorage.setItem('accessToken', accessToken);

//           // get user info
//           const userResponse = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
//             headers: {
//               Authorization: `Bearer ${accessToken}`,
//             },
//           });
//           const userData = await userResponse.json();
//           if (userResponse.ok) {
//             localStorage.setItem('currentUser', JSON.stringify(userData));
//             notifications.show({
//               title: 'Success',
//               message: 'Login successful. User info stored in localStorage.',
//               color: 'green',
//             });
//             router.push('/home'); // direct to home page
//           } else {
//             console.error('Failed to fetch user info:', userData);
//             notifications.show({
//               title: 'Error',
//               message: 'Failed to fetch user info.',
//               color: 'red',
//             });
//           }
//         } else {
//           console.error('Error response from token endpoint:', data);
//           throw new Error(data.error || 'Unknown error');
//         }
//       } catch (error) {
//         notifications.show({
//           title: 'Error',
//           message: 'Login failed.',
//           color: 'red',
//         });
//         console.error('Error during token exchange:', error);
//       }
//     };

//     const code = searchParams.get('code');
//     const state = searchParams.get('state');
//     const instance = `https://${state}`;
//     console.log('Authorization code:', code);
//     if (code) {
//       localStorage.setItem('authCode', code);
//     }

//     if (code) {
//       fetchAccessToken(code, instance);
//     }
//   }, [searchParams, router]);

//   return (
//     <Center>
//       <Loader color="blue" size={41} my={45} />
//     </Center>
//   );
// }

// export default function Callback() {
//   return (
//     <Suspense fallback={<div>Loading...</div>}>
//       <CallbackPage />
//     </Suspense>
//   );
// }
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { Center, Loader } from '@mantine/core';
import { Suspense } from 'react';
import { BASE_URL } from "../../utils/DevMode";

const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
const clientSecret = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;

// 确保 BASE_URL 配置正确
const redirectUri = `http://localhost:3000/callback`;
// const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';


function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 获取授权码并交换访问令牌
  useEffect(() => {
    const fetchAccessToken = async (code: string, instance: string) => {
      try {
        // 发送请求交换授权码为访问令牌
        const response = await fetch(`${instance}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          const accessToken = "ERc0qEK8bGynL84tnYClPHEGoxLiStn-Af8-qrHDoSk";
          localStorage.setItem('accessToken', accessToken);

          // 获取用户信息
          const userResponse = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          const userData = await userResponse.json();

          if (userResponse.ok) {
            localStorage.setItem('currentUser', JSON.stringify(userData));
            notifications.show({
              title: 'Success',
              message: 'Login successful. User info stored in localStorage.',
              color: 'green',
            });
            router.push('/home'); // 登录成功后跳转到首页
          } else {
            console.error('Failed to fetch user info:', userData);
            notifications.show({
              title: 'Error',
              message: 'Failed to fetch user info.',
              color: 'red',
            });
          }
        } else {
          console.error('Error response from token endpoint:', data);
          throw new Error(data.error || 'Unknown error');
        }
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'Login failed.',
          color: 'red',
        });
        console.error('Error during token exchange:', error);
      }
    };

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (!code || !state) {
      notifications.show({
        title: 'Error',
        message: 'Authorization code or state missing.',
        color: 'red',
      });
      router.push('/'); // 如果缺少授权码或状态，跳转回首页
      return;
    }

    const instance = `https://${state}`;
    console.log('Authorization code:', code);

    // 保存授权码到 localStorage
    localStorage.setItem('authCode', code);

    // 交换授权码为访问令牌
    fetchAccessToken(code, instance);

  }, [searchParams, router]);

  return (
    <Center>
      <Loader color="blue" size={41} my={45} />
    </Center>
  );
}

export default function Callback() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackPage />
    </Suspense>
  );
}
