// Short procedural mechanical accents. Audio is created only by a sound-button gesture.
export function createRevealAudio() {
  let context, master, enabled=false;
  function silence() {
    if(!context)return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0,context.currentTime,.015);
  }
  function cue(index=0,reverse=false) {
    if(!enabled || !context || document.hidden)return;
    const time=context.currentTime;
    master.gain.cancelScheduledValues(time);master.gain.setTargetAtTime(.055,time,.006);
    [1,2.03,3.91].forEach((harmonic,i)=>{
      const oscillator=context.createOscillator(), envelope=context.createGain();
      oscillator.type='sine';
      const pitch=(reverse?155:210)+index*38;
      oscillator.frequency.setValueAtTime(pitch*harmonic,time);
      oscillator.frequency.exponentialRampToValueAtTime(pitch*harmonic*.67,time+.14);
      envelope.gain.setValueAtTime(.0001,time);
      envelope.gain.exponentialRampToValueAtTime(.48/(i+1),time+.005);
      envelope.gain.exponentialRampToValueAtTime(.0001,time+.24);
      oscillator.connect(envelope);envelope.connect(master);
      oscillator.start(time);oscillator.stop(time+.25);
      oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
    });
  }
  async function toggle() {
    if(enabled){enabled=false;silence();return false;}
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return false;
    try {
      if(!context){context=new AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination);}
      await context.resume();enabled=true;cue(0);return true;
    } catch {enabled=false;return false;}
  }
  return {toggle,cue,silence,get enabled(){return enabled;}};
}
