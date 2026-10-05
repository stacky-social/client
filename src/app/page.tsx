'use client';

import { useState } from 'react';
import { Anchor, Button, Divider, Text } from '@mantine/core';
import { IconArrowRight, IconCheck, IconFileText, IconLock } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { CrossweaveLogo, DemoBadge } from '../components/NavBar/CrossweaveLogo';
import { PAPER, hasPaperLink } from '../utils/paper';
import { MASTODON_INSTANCE_URL } from '../utils/mastodonApi';
import { prepareForMastodonLogin, startStudySession } from '../utils/studyMode';
import classes from './LandingPage.module.css';

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
          <div className={classes.brandLockup}>
            <CrossweaveLogo height={38} />
            <DemoBadge size="md" />
          </div>
          <Text className={classes.instanceLabel}>Mastodon-powered</Text>
        </header>

        <div className={classes.layout}>
          <section className={classes.introduction} aria-labelledby="welcome-title">
            <Text className={classes.kicker}>Social conversation, with the missing context restored</Text>
            <h1 id="welcome-title" className={classes.headline}>
              Follow the conversation.<br />See how ideas connect.
            </h1>
            <Text className={classes.lede}>
              CrossWeave keeps posts familiar while related perspectives, evidence,
              and questions appear alongside them. Try it now with no account.
            </Text>

            <ol className={classes.steps} aria-label="What you can do in CrossWeave">
              <li><span><IconCheck size={16} /></span><div><strong>Browse a live-style feed</strong><small>Real discussion threads, ready to explore instantly.</small></div></li>
              <li><span><IconCheck size={16} /></span><div><strong>Write a post, get AI feedback</strong><small>See advice and likely replies as you type.</small></div></li>
              <li><span><IconCheck size={16} /></span><div><strong>Explore related responses</strong><small>CrossWeave adds context without changing the original post.</small></div></li>
            </ol>

            <aside className={classes.paper} aria-labelledby="paper-title" data-testid="paper-citation">
              <IconFileText size={20} className={classes.paperIcon} />
              <div>
                <h2 id="paper-title" className={classes.paperTitle}>The research behind this demo</h2>
                <Text className={classes.paperCopy}>
                  CrossWeave is a UI demo for our research paper, not a full-featured site.
                </Text>
                {hasPaperLink() ? (
                  <>
                    {PAPER.citation && <Text className={classes.citation}>{PAPER.citation}</Text>}
                    <Anchor href={PAPER.url} target="_blank" rel="noreferrer" className={classes.paperLink}>
                      Read the paper on arXiv ↗
                    </Anchor>
                  </>
                ) : (
                  <Text className={classes.citation}>arXiv preprint: link coming soon.</Text>
                )}
              </div>
            </aside>

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
              <Text className={classes.cardEyebrow}>Recommended · No account needed</Text>
              <h2 id="access-title" className={classes.cardTitle}>Try CrossWeave now</h2>
              <Text className={classes.cardCopy}>
                Jump into the demo, browse the feed, and draft a post to get instant
                AI writing feedback. Changes stay on this device.
              </Text>
            </div>

            <Button
              fullWidth
              size="lg"
              radius="md"
              className={`${classes.primaryButton} ${classes.demoHighlight}`}
              rightSection={<IconArrowRight size={18} />}
              onClick={handleStartDemo}
              data-testid="start-study-session"
            >
              Explore the demo
            </Button>

            <Divider label="Already on Mastodon?" labelPosition="center" className={classes.divider} />

            <div className={classes.accountLinks}>
              <Button
                variant="subtle"
                size="xs"
                className={classes.secondaryLink}
                loading={isLoading}
                onClick={handleLogin}
                data-testid="mastodon-sign-in"
              >
                Sign in
              </Button>
              <span aria-hidden="true">·</span>
              <Button
                variant="subtle"
                size="xs"
                disabled
                className={classes.disabledLink}
                leftSection={<IconLock size={12} />}
                title="Account sign-up is closed during the demo"
                data-testid="create-account"
              >
                Create an account
              </Button>
            </div>

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
