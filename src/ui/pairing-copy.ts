import type { PairingCopy } from '../network/pairing';

export const PRACTICE_PAIRING_COPY: PairingCopy = {
  description: 'One phone controls this station. Keep this laptop page open.',
  openReason: 'Pair your phone and enable controls to take off.',
  renewReason: 'Phone revoked. Pair again with the new code.',
  instructions: {
    wireless:
      'Scan the code with your phone camera, open the link, rotate to landscape, and tap Enable controls. Both devices need internet access; Wi-Fi or mobile data works. No phone app or laptop installation is needed. Close this dialog before taking off. Share this link only with the person controlling your flight.',
    usb: 'Click Connect USB phone before scanning the code. Both the pairing page and controls travel through the cable. A connection-refused error on the phone usually means USB forwarding is missing or the trainer has stopped.',
    lan: 'Connect both devices to the same network. Scan this code. Allow the server through the Mac firewall if prompted. Keep the phone awake manually on HTTP Wi-Fi.',
  },
};

export const GAME_PAIRING_COPY: PairingCopy = {
  description: 'Use your usual stick mode for Flight Rush. Keep this laptop page open.',
  openReason: 'Pair your phone, then enable controls to fly.',
  renewReason: 'Phone link renewed. Enable controls on the paired phone.',
  instructions: {
    wireless:
      'Open the link on your phone, rotate to landscape, and enable controls. Close this dialog. Take off starts the run. Keep both pages open.',
    lan: 'Open the link on your phone, rotate to landscape, and enable controls. Close this dialog. Take off starts the run. Keep both pages open.',
    usb: 'Connect USB phone before opening the link. Rotate your phone to landscape, enable controls, and close this dialog. Take off starts the run.',
  },
};
