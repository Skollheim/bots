/*
 * Every user-facing string of Bots. No literal UI text lives anywhere else.
 *
 * `companion` and the small blocks after it come from Boite's catalogue
 * (packages/ui/src/lib/strings.en.ts at c4a8b0f7), where the companion was
 * born; `bots` is what the standalone app adds. Add a key here first: the
 * French catalogue is typed from this one and fails `svelte-check` without it.
 */
export const strings = {
  /** The standalone app: its wait for Boite, its tray and its own windows. */
  bots: {
    name: 'Bots',
    waiting: 'Start Boite to wake the bots',
    waitingHint: 'Bots looks for Boite on this computer every few seconds.',
    connecting: 'Reaching Boite',
    revealFailed: 'Boite could not show it: {reason}',
    revealUnsupported: 'This version of Boite cannot show it. Update Boite, then try again.',
    settingsTitle: 'Bots settings',
    tray: { tooltip: 'Bots', settings: 'Settings', quit: 'Quit' },
    demo: 'Demo mode: a fake Boite, nothing is sent.',
    /** What the demo asks the lead robot first, for a chat exchange to show. */
    demoQuestion: 'What are my agents working on?'
  },

  /** The island hanging from the top of the screen (`components/island/`). */
  island: {
    label: 'Bots',
    tabs: { home: 'Home', chat: 'Chat', drop: 'Drop' },
    settings: 'Settings',
    mute: 'Mute the sounds',
    unmute: 'Turn the sounds on',
    pin: 'Keep the island open',
    unpin: 'Let the island close',
    quiet: 'All quiet',
    busyOne: '{count} agent at work',
    busyMany: '{count} agents at work',
    waitingOne: 'An agent needs you',
    waitingMany: '{count} requests wait for you',
    finished: 'Done',
    talking: '{name} is answering…',
    robot: '{name}. Click to poke it, drag it out to set it loose on the desktop.',
    home: {
      busy: 'At work',
      none: 'No agent at work right now.',
      quotas: 'Quotas',
      reminders: 'Reminders and news',
      focus: 'Focus'
    },
    chat: {
      empty: 'Ask your bots anything: they answer here.',
      to: 'Talk to',
      history: 'Earlier answers',
      hideHistory: 'Hide earlier answers'
    },
    drop: {
      title: 'Drop files here',
      hint: 'They go with your next question, along with a capture if you take one.',
      capture: 'Capture the screen',
      zone: 'Capture a zone',
      captured: 'Screen captured',
      removeShot: 'Remove the capture',
      ask: 'Ask about them'
    },
    attention: { title: 'Your agents need you' },
    dock: 'Back to the island'
  },

  companion: {
    heading: 'Companion',
    moods: { idle: 'Resting', working: 'At work', calling: 'Needs you', happy: 'Done', worried: 'Boite is not answering' },
    open: 'Open the companion',
    close: 'Close the companion',
    ask: 'Ask me something…',
    askLabel: 'Ask the companion',
    askTo: 'Ask {name} something…',
    askToLabel: 'Ask {name}',
    talkTo: 'Talk to {name}',
    send: 'Send',
    stop: 'Stop',
    thinking: 'Thinking…',
    hideReply: 'Hide the reply',
    openThread: 'Open the conversation in Agents',
    openSettings: 'Companion settings',
    noBrain: 'No agent can answer. Sign in to one, or pick one in Bots settings.',
    brainOff: 'The agent picked for the companion is off or signed out. Pick another in Bots settings.',
    noAgent: 'No agent stands as the companion. Add one in Bots settings.',
    cannotShow: 'The screen and files go with a request in the Boite desktop app only.',
    failed: 'That did not work: {reason}',
    unreachable: 'Boite is out of reach. The companion keeps trying.',
    finished: 'Done: {title}',
    requestsOne: '1 request',
    requestsMany: '{count} requests',
    threadsOne: '1 thread at work',
    threadsMany: '{count} threads at work',
    nothingWaiting: 'No agent is waiting for you.',
    noRush: 'No rush',
    threads: 'Threads',
    status: { queued: 'Queued', running: 'At work', waiting: 'Waiting for you', done: 'Done' },
    asyncHint: 'The agent carries on while it waits for your answer.',
    answer: 'Your answer…',
    answerLabel: 'Your answer',
    confirm: 'Confirm',
    skip: 'Skip',
    allow: 'Allow',
    deny: 'Deny',
    archivedThread: 'Archived thread',
    untitled: 'Untitled thread',
    verbs: {
      run: 'Wants to run',
      edit: 'Wants to edit',
      write: 'Wants to write',
      read: 'Wants to read',
      open: 'Wants to open',
      search: 'Wants to search',
      use: 'Wants to use {tool}'
    },
    media: { previous: 'Previous track', next: 'Next track', play: 'Play', pause: 'Pause' },
    hud: {
      label: 'Threads at work and quotas',
      openThread: 'Open {title} in Boite',
      since: 'For {time}',
      quotas: 'Quotas',
      quotaUnknown: 'unknown',
      quotaLow: 'running low',
      quotaOut: 'nearly out'
    },
    pomodoro: {
      start: 'Pomodoro',
      startTitle: 'Start a pomodoro: {work} min of work, then a {rest} min break',
      stop: {
        pomodoro: 'Stop the pomodoro',
        countdown: 'Stop the timer',
        stopwatch: 'Stop the stopwatch'
      },
      pause: 'Pause',
      resume: 'Resume',
      skip: 'Skip',
      work: 'Work',
      rest: 'Break',
      countdown: 'Timer',
      stopwatch: 'Stopwatch',
      left: '{phase}, {time} left',
      elapsed: '{phase}, {time} so far',
      paused: '{phase}, paused at {time}',
      done: 'Timer done',
      doneFor: 'Timer done: {label}',
      breakTitle: 'Break, {minutes} min',
      breakHint: 'Stand up, stretch, drink something. I am taking it with you.',
      skipBreak: 'Skip the break'
    },
    focus: {
      label: 'Focus',
      turnOn: 'Focus: finished threads wait and sounds stay off, except agents that need you and reminders',
      turnOff: 'End the focus',
      recapOne: 'During the focus: 1 thread finished',
      recapMany: 'During the focus: {count} threads finished'
    },
    history: {
      label: 'History',
      title: 'Earlier exchanges',
      loading: 'Reading the conversation…',
      empty: 'Nothing said yet.',
      noReply: 'No reply',
      pick: 'Show this reply in the bubble'
    },
    drop: {
      label: 'Files for your next question',
      hint: 'Drop to attach to your next question',
      remove: 'Remove {name}',
      reading: 'Reading the files…'
    },
    task: {
      label: 'Threads launched for you',
      confirmTitle: 'Launch a thread in {project}?',
      launch: 'Launch',
      cancel: 'Cancel',
      launched: 'Thread launched in {project}',
      openHint: 'Open it in Boite',
      unknown: 'I do not know a project called "{name}".',
      near: 'Did you mean {names}?',
      known: 'Your projects: {names}.',
      noProject: 'Boite has no project to launch a thread in yet.',
      noAgent: 'No agent can take the thread. Sign in to one in Boite.',
      failed: 'The thread could not be launched: {reason}'
    },
    reply: {
      action: 'Reply from here',
      label: 'Your reply to {title}',
      placeholder: 'Your reply… Enter sends, Shift+Enter adds a line',
      send: 'Send'
    },
    radar: {
      one: 'A thread is waiting for you',
      many: '{count} threads are waiting for you',
      openFirst: 'Open the first',
      openHint: 'Open it in Boite',
      later: 'Later',
      laterHint: 'Hide for 30 minutes, unless another thread starts waiting',
      more: 'And {count} more',
      kinds: {
        permission: 'Permission requested',
        question: 'Question asked',
        answer: 'Answer to read',
        failed: 'Stopped on an error'
      }
    },
    find: {
      searching: 'Looking for "{query}"…',
      found: 'Threads about "{query}"',
      closest: 'Closest to "{query}"',
      none: 'No thread about "{query}"',
      archived: 'Archived',
      openHint: 'Open it in Boite'
    },
    openMissing: 'I cannot find that thread in Boite.',
    seeScreen: 'Show my screen with this request',
    seeingScreen: 'Your screen goes with this request. Click to leave it out.',
    screenFailed: 'The screen could not be captured. Click the eye to send without it.',
    screenScope: 'What the companion sees',
    screenAll: 'All screens',
    screenHere: 'This screen',
    screenZone: 'A part',
    screenZoneTitle: 'You pick what to show when you send',
    zoneLabel: 'Pick what to show',
    zoneHint: 'Drag over what to show, or click to show the whole screen. Esc cancels.',
    zoneOtherScreen: 'Move the pointer to another screen to pick there.',
    failedThread: 'Stopped on an error: {title}',
    openNotice: 'Open in Boite',
    dismiss: 'Dismiss',
    reminder: 'Reminder',
    reminderDone: 'OK',
    snooze: 'In 10 min',
    snoozeLabel: 'Remind me again in 10 minutes',
    settings: {
      intro: 'The companion lives on your screen: one character per agent you put there. Click one to ask it something or to answer your agents, drag them to move them. Each agent talks in its own conversation, in Agents, through the same accounts and proxy as every thread.',
      desktopOnly: 'The companion runs in the Boite desktop app.',
      place: 'Place',
      screen: 'Screen',
      screenHint: 'The screen the companion sits on. A screen that is unplugged sends it back to the main one.',
      primary: 'Main screen',
      screenSize: '{width} × {height}',
      position: 'Position',
      positionHint: 'Along the top of the screen, or where you dropped it: drag the companion anywhere to move it.',
      anchors: { left: 'Top left', center: 'Top center', right: 'Top right', free: 'Where you left it' },
      brain: 'New agents',
      brainHint: 'What an agent made here for the companion runs on. An agent made already keeps its own model and permissions: change them in Agents.',
      model: 'Model',
      modelHint: 'The agent and model a new companion agent runs on. Automatic takes the first agent signed in, on its small model.',
      automatic: 'Automatic',
      automaticHint: 'First agent signed in, small model',
      account: 'Account',
      effort: 'Effort',
      effortDefault: 'Model default',
      control: 'Computer control',
      controlHint: 'What a new companion agent may do on this computer when you ask it: open apps and pages, play music, launch a game.',
      controls: { ask: 'Ask before acting', auto: 'Act without asking' },
      controlsHint: {
        ask: 'Every command waits for Allow or Deny in the companion.',
        auto: 'Commands run as soon as the companion decides to. It can then do anything your account can on this computer.'
      },
      music: 'React to music',
      musicHint: 'Headphones and a little dance when something plays, and the player controls under the companion.',
      quotas: 'Show quotas',
      quotasHint: 'A small gauge per subscription of the proxy (Douane) beside the companion, with its provider’s logo, red when one nearly runs out. Turn off the ones you do not want to see in the list below.',
      quotasShown: 'Quotas shown beside the companion',
      pomodoro: 'Pomodoro',
      pomodoroHint: 'A work timer beside the companion, started from its panel or by asking it. A break follows the work, and the companion takes it with you. Ask it for a timer or a stopwatch and it shows there too.',
      workMinutes: 'Work',
      breakMinutes: 'Break',
      minutes: '{count} min',
      focusOnWork: 'Focus during work',
      focusOnWorkHint: 'While the pomodoro runs its work phase, finished threads wait for the end and the sounds stay off, except agents that need you and reminders.',
      closeOutside: 'Close when clicking elsewhere',
      closeOutsideHint: 'A click anywhere but on the companion closes its panel, as a menu would. Escape closes it too.',
      hideFullscreen: 'Hide during full-screen apps',
      hideFullscreenHint: 'The companion steps aside while a game or a video fills its screen, and comes back after. The shortcut still calls it.',
      sounds: 'Sounds',
      soundsHint: 'Short chimes when an answer comes, an agent needs you or a reminder rings.',
      radar: 'Waiting threads',
      radarHint: 'When threads have waited for you this long (a permission, a question, an answer you have not read), the companion says so and opens the first on a click.',
      radarOff: 'Off',
      hotkey: 'Shortcut',
      hotkeyHint: 'Calls the companion from any app, ready to type.',
      hotkeyOff: 'None',
      hotkeyTaken: 'Another app already uses {hotkey}. Pick another shortcut.',
      robots: 'Robots',
      robotsHint: 'In the island at the top of the screen, or loose on the desktop. You can also drag a robot out of the island, and back to the top edge to return it.',
      robotsChoice: { island: 'In the island', desktop: 'On the desktop' },
      openOnHover: 'Open on hover',
      openOnHoverHint: 'Resting the pointer on the island a moment opens it. Off, only a click does.',
      mascot: 'Mascot',
      mascotHint: 'The island’s character, and the first agent’s on the desktop: Boîte, the box, or a Jelly.',
      mascotReset: 'Use the first agent’s own look',
      look: 'Look',
      crew: {
        title: 'Agents',
        hint: 'The agents standing on your screen side by side, {count} at most. Click one to talk to it alone: each keeps its own conversation and memory, in Agents. The first one also shows what goes on in Boite.',
        loading: 'Reading the agents…',
        empty: 'No agent stands as the companion. Make one, or add one of your agents.',
        leader: 'Shows what goes on in Boite',
        restyle: 'New look',
        restyleLabel: 'Give {name} a new look',
        open: 'Open {name} in Agents',
        remove: 'Take {name} off the screen',
        lastOne: 'The companion keeps one agent at least.',
        namePlaceholder: 'Name a new agent…',
        nameLabel: 'Name of a new companion agent',
        create: 'Make',
        addExisting: 'Add an agent',
        full: '{count} agents stand already. Take one off to add another.'
      },
      reminders: 'Reminders',
      remindersEmpty: 'No reminder set. Ask the companion, for example: remind me at 6 pm to call Paul.',
      removeReminder: 'Cancel this reminder',
      warmOff: 'Each answer starts the agent again, which takes a few seconds. Warm process minutes, in Boite\'s Settings, Advanced, keeps it loaded between answers.',
      warmOn: 'Agents stay loaded {minutes} min after an answer, so the next one comes sooner.'
    }
  },

  agents: {
    robot: {
      family: 'Style', shape: 'Shape', color: 'Color', eyes: 'Eyes', top: 'Accessory', shuffle: 'Shuffle', customize: 'Customize', done: 'Done',
      option: '{part} {n}', families: { jelly: 'Jelly', bubble: 'Bubble', capsule: 'Capsule', retro: 'Retro', box: 'Box' },
      box: { shape: 'Lid', color: 'Body', eyes: 'Eyes', top: 'Accessory' },
    }
  },

  chat: {
    progress: { starting: 'Starting agent', thinking: 'Thinking', compacting: 'Compacting context', retrying: 'Retrying request', tool: 'Running tool', working: 'Receiving activity', waiting: 'Waiting for provider' }
  },

  composer: {
    attachReadError: '{name} could not be read.',
    attachUnnamed: 'the attachment',
    attachTooLarge: '{name} is too big: a file may weigh {max} at most.',
    attachTooMany: 'A turn carries at most {max} files, so {name} was left out.',
    attachTotalTooLarge: 'The files of one turn weigh {max} at most together, so {name} was left out.'
  },

  quotas: {
    remaining: '{percent}% left'
  }
} as const;

export type Strings = typeof strings;

/** `fill('Open {title} in Boite', { title: 'Notes' })`. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
