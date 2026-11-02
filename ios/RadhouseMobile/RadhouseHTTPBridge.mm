#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(RadhouseHTTP, NSObject)
RCT_EXTERN_METHOD(randomBytes:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(request:(NSString *)url method:(NSString *)method access:(NSString *)access local:(NSString *)local csrf:(NSString *)csrf body:(NSString *)body resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(syncCookies:(NSString *)access local:(NSString *)local resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearCookies:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
