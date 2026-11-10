#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <PDFKit/PDFKit.h>
#import <Vision/Vision.h>

static NSString *recognize(CGImageRef image) {
  if (!image) return @"";
  VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
  request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
  request.recognitionLanguages = @[ @"zh-Hans", @"zh-Hant", @"en-US" ];
  request.usesLanguageCorrection = YES;
  VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
  [handler performRequests:@[ request ] error:nil];
  NSMutableArray<NSString *> *lines = [NSMutableArray array];
  for (VNRecognizedTextObservation *observation in request.results) {
    NSString *line = [observation topCandidates:1].firstObject.string;
    if (line.length) [lines addObject:line];
  }
  return [lines componentsJoinedByString:@"\n"];
}

static CGImageRef imageFromPage(PDFPage *page) {
  NSRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  CGFloat width = bounds.size.width * 2;
  CGFloat height = bounds.size.height * 2;
  if (width < 8 || height < 8 || width * height > 16000000) return nil;
  NSImage *thumb = [page thumbnailOfSize:NSMakeSize(width, height) forBox:kPDFDisplayBoxMediaBox];
  CGImageRef image = [thumb CGImageForProposedRect:NULL context:nil hints:nil];
  if (image) CGImageRetain(image);
  return image;
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    if (argc < 2) return 0;
    NSString *path = [NSString stringWithUTF8String:argv[1]];
    NSURL *url = [NSURL fileURLWithPath:path];
    NSString *kind = url.pathExtension.lowercaseString;
    NSMutableArray<NSString *> *pages = [NSMutableArray array];
    if ([kind isEqualToString:@"pdf"]) {
      PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
      NSUInteger count = MIN(document.pageCount, 30);
      for (NSUInteger index = 0; index < count; index++) {
        CGImageRef image = imageFromPage([document pageAtIndex:index]);
        NSString *text = [recognize(image) stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        if (image) CGImageRelease(image);
        if (text.length) [pages addObject:text];
      }
    } else {
      CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
      CGImageRef cg = source ? CGImageSourceCreateImageAtIndex(source, 0, NULL) : nil;
      if (source) CFRelease(source);
      NSString *text = [recognize(cg) stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
      if (cg) CGImageRelease(cg);
      if (text.length) [pages addObject:text];
    }
    NSData *data = [[pages componentsJoinedByString:@"\n\n"] dataUsingEncoding:NSUTF8StringEncoding];
    if (data) fwrite(data.bytes, 1, data.length, stdout);
  }
  return 0;
}
