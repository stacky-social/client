'use client';

import { useState } from 'react';
import { Anchor, Button, Divider, Text } from '@mantine/core';
import { IconArrowRight, IconCheck, IconExternalLink, IconUserPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { CrossweaveLogo } from '../components/NavBar/CrossweaveLogo';
import { MASTODON_INSTANCE_URL } from '../utils/mastodonApi';
import { prepareForMastodonLogin, startStudySession } from '../utils/studyMode';
import classes from './LandingPage.module.css';

const ACCOUNT_REGISTRATION_URL = `${MASTODON_INSTANCE_URL}/auth/sign_up`;

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = () => {
    prepareForMastodonLogin();
    setIsLoading(true);
    window.location.assign('/api/auth/mastodon/start');
  };

  const handleStartDemo = () => {
    startStudySession();
    router.push('/home');
  };

  return (
    <main className={classes.page}>
      <div className={classes.weaveRail} aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className={classes.shell}>
        <header className={classes.brandBar}>
          <CrossweaveLogo height={38} />
          <Text className={classes.instanceLabel}>Mastodon-powered</Text>
        </header>

        <div className={classes.layout}>
          <section className={classes.introduction} aria-labelledby="welcome-title">
            <Text className={classes.kicker}>Social conversation, with the missing context restored</Text>
            <h1 id="welcome-title" className={classes.headline}>
              Follow the conversation.<br />See how ideas connect.
            </h1>
            <Text className={classes.lede}>
              CrossWeave is a Mastodon-powered community where posts stay familiar,
              while related perspectives, evidence, and questions appear alongside them.
            </Text>

            <ol className={classes.steps} aria-label="What you can do in CrossWeave">
              <li><span><IconCheck size={16} /></span><div><strong>Read your real home timeline</strong><small>Posts from people and conversations you follow.</small></div></li>
              <li><span><IconCheck size={16} /></span><div><strong>Post and respond normally</strong><small>Your posts, likes, and bookmarks are saved to Mastodon.</small></div></li>
              <li><span><IconCheck size={16} /></span><div><strong>Explore related responses</strong><small>CrossWeave adds context without changing the original post.</small></div></li>
            </ol>

            <div className={classes.threadPreview} aria-hidden="true">
              <div className={classes.previewRail}><i /><i /><i /><i /></div>
              <div className={classes.previewPost}><b /><span><i /><i /></span></div>
              <div className={classes.previewBranch} />
              <div className={classes.previewPost}><b /><span><i /><i /></span></div>
              <div className={classes.previewContext}><em /><em /><em /></div>
            </div>
          </section>

          <section className={classes.accessCard} aria-labelledby="access-title">
            <div className={classes.cardHeader}>
              <Text className={classes.cardEyebrow}>Your account</Text>
              <h2 id="access-title" className={classes.cardTitle}>Sign in to CrossWeave</h2>
              <Text className={classes.cardCopy}>
                Continue with Mastodon. You will confirm access on its sign-in page.
              </Text>
            </div>

            <Button
              fullWidth
              size="lg"
              radius="md"
              className={classes.primaryButton}
              rightSection={<IconArrowRight size={18} />}
              loading={isLoading}
              onClick={handleLogin}
              data-testid="mastodon-sign-in"
            >
              Sign in
            </Button>

            <Button
              component="a"
              href={ACCOUNT_REGISTRATION_URL}
              fullWidth
              size="md"
              radius="md"
              variant="outline"
              className={classes.createButton}
              leftSection={<IconUserPlus size={18} />}
              rightSection={<IconExternalLink size={15} />}
              data-testid="create-account"
            >
              Create an account
            </Button>

            <Text className={classes.privacyCopy}>
              CrossWeave · Mastodon-powered
            </Text>

            <Divider label="Want to look around first?" labelPosition="center" className={classes.divider} />

            <button className={classes.demoButton} type="button" onClick={handleStartDemo} data-testid="start-study-session">
              <span>
                <strong>Explore the JSON demo</strong>
                <small>No account needed · changes stay on this device</small>
              </span>
              <IconArrowRight size={18} />
            </button>

            <Text className={classes.terms}>
              By continuing, you agree to follow the community rules.{' '}
              <Anchor href={`${MASTODON_INSTANCE_URL}/about`} target="_blank" rel="noreferrer">
                About this server
              </Anchor>
            </Text>
          </section>
        </div>
      </div>
    </main>
  );
}
