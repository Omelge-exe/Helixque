# Screenshare Testing Guide

## ✅ Servers Status
- **Backend**: Running on http://localhost:5001 ✅
- **Frontend**: Running on http://localhost:3001 ✅
- **Dependencies**: All resolved ✅

## 🧪 Testing Steps

### 1. Open Two Browser Windows
- Window 1: http://localhost:3001
- Window 2: http://localhost:3001 (or use incognito mode)

### 2. Set Up Users
- Enter different names in each window (e.g., "User1" and "User2")
- Click "Find Match" or navigate to the matching system
- Wait for the system to connect both users

### 3. Test Basic Video Chat
- Ensure both users can see each other's video feeds
- Test microphone and camera toggles
- Verify chat functionality works

### 4. Test Screenshare Feature

#### Starting Screenshare:
1. In one window, click the **Monitor** icon (screenshare button)
2. Browser will prompt to select screen/window/tab to share
3. Select what you want to share and click "Share"
4. **Expected Results:**
   - Sharing user sees small preview in top-right corner (blue border)
   - Receiving user sees full overlay of shared screen
   - Monitor button turns blue and shows "MonitorStop" icon

#### Receiving Screenshare:
1. The other user should immediately see the shared screen
2. **Expected Results:**
   - Full overlay with blue border appears over the main video
   - Label shows "Peer's Screen" with monitor icon
   - Original video feed continues in background

#### Stopping Screenshare:
1. Click the **MonitorStop** button (blue button)
   - OR use browser's "Stop sharing" button
2. **Expected Results:**
   - Screenshare overlay disappears on both screens
   - Button returns to normal Monitor icon
   - Regular video chat continues normally

### 5. Edge Cases to Test

#### Browser Controls:
- Start screenshare, then use browser's "Stop sharing" button
- Should automatically clean up and notify peer

#### Connection Handling:
- Start screenshare, then click "Next" to find new partner
- Should properly clean up screenshare before switching

#### Multiple Tracks:
- Test with camera on/off during screenshare
- Test with microphone on/off during screenshare
- Verify all tracks work independently

### 6. UI Verification

#### Visual Elements:
- **Monitor Button**: Gray when inactive, blue when sharing
- **Local Preview**: Top-right corner when sharing (blue border)
- **Remote Display**: Full overlay when receiving (blue border)
- **Labels**: "Your Screen" and "Peer's Screen" with monitor icons

#### Responsive Design:
- Test on different screen sizes
- Verify overlays scale properly
- Check mobile compatibility

## 🔧 Troubleshooting

### Common Issues:

1. **"Permission denied" for screenshare**
   - Browser blocked screenshare permission
   - Check browser settings and allow screen sharing

2. **No screenshare overlay appears**
   - Check browser console for errors
   - Verify both users are properly connected

3. **Screenshare stops unexpectedly**
   - User may have closed the shared window/tab
   - This is expected behavior - screenshare ends automatically

### Debug Information:
- Open browser developer tools (F12)
- Check Console tab for any error messages
- Network tab shows WebSocket connections
- Backend logs show socket events

## 🎯 Success Criteria

The implementation is successful if:
- ✅ Users can start/stop screenshare with button click
- ✅ Screenshare appears on both users' screens immediately
- ✅ Local user sees preview, remote user sees full overlay
- ✅ Screenshare works independently of camera/mic
- ✅ Proper cleanup when stopping or switching partners
- ✅ Browser "Stop sharing" button works correctly
- ✅ No memory leaks or hanging connections

## 📱 Browser Compatibility
- **Chrome/Edge**: Full support including system audio
- **Firefox**: Video sharing supported, audio may vary
- **Safari**: Basic screenshare support
- **Mobile**: Limited support (depends on browser)

The screenshare implementation is now ready for testing with separate tracks that reflect on both users' screens as requested!
