import React from 'react';
import * as simplewebauthn from '@simplewebauthn/browser';
import { useRouter } from 'next/router';
import { FormattedMessage } from 'react-intl';

import { createError, ERROR } from '../../lib/errors';
import { onPressEnter } from '../../lib/form-utils';
import useLoggedInUser from '../../lib/hooks/useLoggedInUser';
import { getFromLocalStorage, LOCAL_STORAGE_KEYS, setLocalStorage } from '../../lib/local-storage';
import { useTwoFactorAuthenticationPrompt } from '../../lib/two-factor-authentication/TwoFactorAuthenticationContext';
import { getSettingsRoute } from '../../lib/url-helpers';

import { getI18nLink } from '../I18nFormatters';
import Link from '../Link';
import StyledLinkButton from '../StyledLinkButton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useToast } from '../ui/useToast';

function initialMethod(supportedMethods: string[]) {
  if (!supportedMethods) {
    return null;
  }
  if (supportedMethods.length === 1) {
    return supportedMethods[0];
  }

  const preferredMethod = getFromLocalStorage(LOCAL_STORAGE_KEYS.PREFERRED_TWO_FACTOR_METHOD);
  return (
    supportedMethods.find(method => method === preferredMethod) ||
    supportedMethods.find(method => method !== 'recovery_code')
  );
}

export default function TwoFactorAuthenticationModal() {
  const { toast } = useToast();
  const { LoggedInUser } = useLoggedInUser();

  const prompt = useTwoFactorAuthenticationPrompt();
  const isOpen = prompt?.isOpen ?? false;
  const supportedMethods = React.useMemo(() => {
    return (prompt?.supportedMethods ?? []).filter(method => {
      return method !== 'recovery_code' || prompt?.allowRecovery;
    });
  }, [prompt?.supportedMethods, prompt.allowRecovery]);

  const cancellable = !prompt.isRequired;

  const [selectedMethod, setSelectedMethod] = React.useState(initialMethod(supportedMethods));
  const [twoFactorCode, setTwoFactorCode] = React.useState('');
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (supportedMethods.length > 0) {
      setSelectedMethod(initialMethod(supportedMethods));
    }
  }, [supportedMethods]);

  const useWebAuthn = React.useCallback(async () => {
    setLocalStorage(LOCAL_STORAGE_KEYS.PREFERRED_TWO_FACTOR_METHOD, 'webauthn');
    setConfirming(true);
    setTwoFactorCode('');
    try {
      const authenticationResponse = await simplewebauthn.startAuthentication(prompt.authenticationOptions.webauthn);
      const base64AuthenticationResponse = Buffer.from(JSON.stringify(authenticationResponse), 'utf8').toString(
        'base64',
      );

      prompt.resolveAuth({
        type: 'webauthn',
        code: base64AuthenticationResponse,
      });
    } catch (e) {
      toast({ variant: 'error', message: e.message });
      return;
    } finally {
      setConfirming(false);
    }
  }, [prompt]);

  const cancel = React.useCallback(() => {
    setTwoFactorCode('');
    setConfirming(false);
    setSelectedMethod(null);
    prompt.rejectAuth(createError(ERROR.TWO_FACTOR_AUTH_CANCELED));
  }, []);

  const confirm = React.useCallback(() => {
    const code = twoFactorCode;
    setConfirming(true);
    setTwoFactorCode('');
    setSelectedMethod(null);

    if (selectedMethod !== 'recovery_code') {
      setLocalStorage(LOCAL_STORAGE_KEYS.PREFERRED_TWO_FACTOR_METHOD, selectedMethod);
    }

    prompt.resolveAuth({
      type: selectedMethod,
      code,
    });

    setConfirming(false);
  }, [twoFactorCode, supportedMethods, selectedMethod]);

  const router = useRouter();

  React.useEffect(() => {
    const handleRouteChange = () => {
      cancel();
    };
    router.events.on('routeChangeStart', handleRouteChange);
    return () => router.events.off('routeChangeStart', handleRouteChange);
  }, [cancel]);

  const verifyBtnEnabled =
    supportedMethods.length > 0 &&
    ((selectedMethod === 'recovery_code' && twoFactorCode?.length > 0) ||
      (selectedMethod === 'totp' && twoFactorCode?.length === 6) ||
      selectedMethod === 'webauthn');

  const alternativeMethods = supportedMethods.filter(method => method !== selectedMethod);

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          cancel();
        }
      }}
    >
      <AlertDialogContent withBackdropBlur>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {supportedMethods.length === 0 ? (
              <FormattedMessage defaultMessage="You must configure 2FA to access this feature" />
            ) : (
              <FormattedMessage defaultMessage="Two Factor Authentication" />
            )}
          </AlertDialogTitle>
          {LoggedInUser && supportedMethods.length === 0 && (
            <AlertDialogDescription>
              <FormattedMessage
                defaultMessage="To enable Two-Factor Authentication (2FA), follow the steps <link>here</link>"
                values={{
                  link: getI18nLink({
                    href: getSettingsRoute(LoggedInUser.collective, 'user-security'),
                    as: Link,
                  }),
                }}
              />
            </AlertDialogDescription>
          )}
          {selectedMethod === 'recovery_code' && (
            <RecoveryCodeOptions value={twoFactorCode} onChange={setTwoFactorCode} disabled={confirming} />
          )}

          {selectedMethod === 'totp' && (
            <AuthenticatorOption
              value={twoFactorCode}
              onChange={setTwoFactorCode}
              supportedMethods={supportedMethods}
              disabled={confirming}
              onSubmit={confirm}
            />
          )}

          {selectedMethod === 'webauthn' && <WebauthnOption />}

          {supportedMethods.length > 1 && (
            <div className="pt-2">
              <p className="text-sm text-muted-foreground">
                <FormattedMessage defaultMessage="You can also use alternative methods:" />
              </p>
              <ul className="ml-2 list-inside list-disc text-muted-foreground [&>li]:mt-2">
                {alternativeMethods.includes('totp') && (
                  <li>
                    <StyledLinkButton onClick={() => setSelectedMethod('totp')}>
                      <FormattedMessage defaultMessage="Authenticator Code" />
                    </StyledLinkButton>
                  </li>
                )}
                {alternativeMethods.includes('webauthn') && (
                  <li>
                    <StyledLinkButton onClick={() => setSelectedMethod('webauthn')}>
                      <FormattedMessage defaultMessage="U2F (Hardware Key, Passkey, Phone, etc)" />
                    </StyledLinkButton>
                  </li>
                )}
                {alternativeMethods.includes('recovery_code') && (
                  <li>
                    <StyledLinkButton onClick={() => setSelectedMethod('recovery_code')}>
                      <FormattedMessage defaultMessage="Recovery code" />
                    </StyledLinkButton>
                  </li>
                )}
              </ul>
            </div>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter>
          {cancellable && (
            <AlertDialogCancel disabled={confirming}>
              <FormattedMessage id="actions.cancel" defaultMessage="Cancel" />
            </AlertDialogCancel>
          )}
          <Button
            loading={confirming}
            disabled={!verifyBtnEnabled}
            onClick={selectedMethod === 'webauthn' ? useWebAuthn : confirm}
          >
            {selectedMethod === 'recovery_code' ? (
              <FormattedMessage id="login.twoFactorAuth.reset" defaultMessage="Reset 2FA" />
            ) : (
              <FormattedMessage id="actions.verify" defaultMessage="Verify" />
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AuthenticatorOption(props: {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: (val: string) => void;
  supportedMethods: string[];
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <FormattedMessage
          id="TwoFactorAuth.Setup.Form.InputLabel"
          defaultMessage="Please enter your 6-digit code without any dashes."
        />
      </p>

      <Input
        id="2fa-code-input"
        name="2fa-code-input"
        className="h-12 text-xl"
        type="text"
        placeholder={'123456'}
        pattern={'[0-9]{6}'}
        inputMode="numeric"
        value={props.value}
        onKeyUp={onPressEnter(props.onSubmit)}
        onChange={e => props.onChange(e.target.value)}
        disabled={props.disabled}
        autoFocus
      />
    </div>
  );
}

function RecoveryCodeOptions(props: { value: string; onChange: (string) => void; disabled: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <FormattedMessage
          id="TwoFactorAuth.RecoveryCodes.Form.InputLabel"
          defaultMessage="Please enter one of your alphanumeric recovery codes."
        />
      </p>
      <Input
        id="2fa-code-input"
        name="2fa-code-input"
        className="h-12 text-xl"
        type="text"
        placeholder="ABCDEFGHIJKLM123"
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        disabled={props.disabled}
        autoFocus
      />
    </div>
  );
}

function WebauthnOption() {
  return (
    <p className="text-sm text-muted-foreground">
      <FormattedMessage defaultMessage="Use your device for two factor authentication" />
    </p>
  );
}
